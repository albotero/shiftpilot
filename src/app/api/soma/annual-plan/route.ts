import {
  getSomaAnnualPlanKey,
  getSomaYearEndWindow,
  somaAnnualPlanSchema,
  type SomaAnnualPlan,
} from "@/lib/calendar/annual-plan"
import type { Prisma } from "@prisma/client"
import { generateSomaAlternate, generateSomaRotation, getScheduledSomaDays } from "@/lib/calendar/soma-rotation"
import type { SomaStatus } from "@/lib/calendar/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

type PlannedShift = {
  date: Date
  period: "AM" | "PM" | "NOCHE"
  status: SomaStatus
  durationHours: number
}

function toPlannedShifts(days: ReturnType<typeof generateSomaRotation>): PlannedShift[] {
  return getScheduledSomaDays(days).flatMap((day) => {
    const date = new Date(`${day.date}T00:00:00.000Z`)
    const shifts: PlannedShift[] = (["AM", "PM"] as const).map((period) => ({
      date,
      period,
      status: day.status,
      durationHours: 6,
    }))
    if (day.status === "TURNO") shifts.push({ date, period: "NOCHE", status: "NOCHE", durationHours: 12 })
    return shifts
  })
}

async function createMissingShifts(tx: Prisma.TransactionClient, workId: string, planned: PlannedShift[]) {
  if (planned.length === 0) return 0
  const dates = planned.map((shift) => shift.date)
  const existing = await tx.shift.findMany({
    where: { workId, date: { gte: dates[0], lte: dates[dates.length - 1] } },
    select: { date: true, period: true, status: true, durationHours: true, manualOverride: true },
  })
  const expectedByKey = new Map(
    planned.map((shift) => [`${shift.date.toISOString().slice(0, 10)}:${shift.period}`, shift]),
  )
  const existingByKey = new Map(
    existing.map((shift) => [`${shift.date.toISOString().slice(0, 10)}:${shift.period}`, shift]),
  )

  for (const [key, shift] of existingByKey) {
    const expected = expectedByKey.get(key)
    if (shift.manualOverride) continue
    if (!expected || shift.status !== expected.status || shift.durationHours !== expected.durationHours) {
      throw new Error(`SHIFT_CONFLICT:${key}`)
    }
  }

  const missing = planned.filter(
    (shift) => !existingByKey.has(`${shift.date.toISOString().slice(0, 10)}:${shift.period}`),
  )
  if (missing.length === 0) return 0
  const result = await tx.shift.createMany({
    data: missing.map((shift) => ({ ...shift, workId })),
    skipDuplicates: true,
  })
  return result.count
}

async function getPlans() {
  const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: "soma.annualPlan." } } })
  const plans = new Map<number, SomaAnnualPlan>()
  for (const setting of settings) {
    const parsed = somaAnnualPlanSchema.safeParse(setting.value)
    if (parsed.success) plans.set(parsed.data.year, parsed.data)
  }
  return plans
}

export async function GET(request: Request) {
  const year = Number(new URL(request.url).searchParams.get("year"))
  if (!Number.isInteger(year) || year < 1900 || year > 9998) {
    return Response.json({ error: "Año inválido" }, { status: 400 })
  }

  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: getSomaAnnualPlanKey(year) } })
    if (!setting) return Response.json(null)
    const parsed = somaAnnualPlanSchema.safeParse(setting.value)
    if (!parsed.success) return Response.json({ error: "El plan guardado no es válido" }, { status: 500 })
    return Response.json(parsed.data)
  } catch {
    return Response.json({ error: "Base de datos local no disponible" }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = somaAnnualPlanSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Plan anual inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  const plan = parsed.data
  try {
    const plans = await getPlans()
    const storedPlan = plans.get(plan.year)
    const nextPlan = plans.get(plan.year + 1)

    if (
      storedPlan &&
      (storedPlan.mainStartDate !== plan.mainStartDate ||
        storedPlan.mainEndDate !== plan.mainEndDate ||
        storedPlan.anchorDate !== plan.anchorDate ||
        storedPlan.anchorStatus !== plan.anchorStatus)
    ) {
      return Response.json(
        {
          error: "La secuencia principal ya tiene turnos guardados; no se puede cambiar sin una corrección explícita.",
        },
        { status: 409 },
      )
    }
    if (storedPlan && storedPlan.yearEndMode !== plan.yearEndMode && nextPlan) {
      return Response.json(
        { error: "El bloque especial ya está cerrado por el plan del año siguiente." },
        { status: 409 },
      )
    }

    for (const other of plans.values()) {
      if (
        other.year !== plan.year &&
        plan.mainStartDate <= other.mainEndDate &&
        other.mainStartDate <= plan.mainEndDate
      ) {
        return Response.json({ error: `La secuencia principal se cruza con el plan ${other.year}.` }, { status: 409 })
      }
    }

    const work = await prisma.work.findUnique({ where: { name: "Soma" } })
    if (!work) return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })

    const planMap = new Map(plans)
    planMap.set(plan.year, plan)
    const effectivePrevious = planMap.get(plan.year - 1)
    const effectiveNext = planMap.get(plan.year + 1)
    const mainShifts = toPlannedShifts(
      generateSomaRotation(plan.mainStartDate, plan.mainEndDate, plan.anchorDate, plan.anchorStatus),
    )
    const specialShiftSets: PlannedShift[][] = []

    if (effectivePrevious?.yearEndMode === "ALTERNATE") {
      const window = getSomaYearEndWindow(effectivePrevious, plan)
      if (window.endDate) {
        specialShiftSets.push(toPlannedShifts(generateSomaAlternate(window.startDate, window.endDate)))
      }
    }

    if (plan.yearEndMode === "ALTERNATE" && effectiveNext) {
      const window = getSomaYearEndWindow(plan, effectiveNext)
      if (window.endDate) {
        specialShiftSets.push(toPlannedShifts(generateSomaAlternate(window.startDate, window.endDate)))
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const insertedMain = await createMissingShifts(tx, work.id, mainShifts)
      let insertedSpecial = 0
      for (const set of specialShiftSets) insertedSpecial += await createMissingShifts(tx, work.id, set)

      await tx.appSetting.upsert({
        where: { key: getSomaAnnualPlanKey(plan.year) },
        create: { key: getSomaAnnualPlanKey(plan.year), value: plan },
        update: { value: plan },
      })

      return { insertedMain, insertedSpecial }
    })

    const yearEndWindow = getSomaYearEndWindow(plan, effectiveNext)
    return Response.json({
      plan,
      yearEndWindow,
      insertedMainShifts: result.insertedMain,
      insertedSpecialShifts: result.insertedSpecial,
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SHIFT_CONFLICT:")) {
      return Response.json(
        { error: "Ya existen turnos distintos dentro del rango; no se modificó ningún dato." },
        { status: 409 },
      )
    }
    return Response.json({ error: "No se pudo guardar el plan anual" }, { status: 503 })
  }
}
