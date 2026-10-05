import { PrismaClient } from "@prisma/client"
import { getSomaAnnualPlanKey, somaAnnualPlanSchema } from "../src/lib/calendar/annual-plan"
import { generateSomaRotation, getScheduledSomaDays } from "../src/lib/calendar/soma-rotation"

const prisma = new PrismaClient()

async function main() {
  const setting = await prisma.appSetting.findUnique({ where: { key: getSomaAnnualPlanKey(2026) } })
  if (!setting) throw new Error("No saved Soma annual plan for 2026.")
  const parsed = somaAnnualPlanSchema.safeParse(setting.value)
  if (!parsed.success) throw new Error("The saved Soma 2026 plan is invalid.")
  const plan = parsed.data

  const allDays = generateSomaRotation(plan.mainStartDate, plan.mainEndDate, plan.anchorDate, plan.anchorStatus)
  const scheduledDays = getScheduledSomaDays(allDays)
  const expectedByKey = new Map(
    scheduledDays.flatMap((day) =>
      (["AM", "PM"] as const).map((period) => [
        `${day.date}:${period}`,
        { date: day.date, period, status: day.status },
      ]),
    ),
  )
  const firstDate = new Date(`${plan.mainStartDate}T00:00:00.000Z`)
  const lastDate = new Date(`${plan.mainEndDate}T00:00:00.000Z`)
  const existing = await prisma.shift.findMany({
    where: { work: { name: "Soma" }, date: { gte: firstDate, lte: lastDate } },
    select: { id: true, date: true, period: true, status: true, manualOverride: true },
  })
  const existingByKey = new Map(
    existing.map((shift) => [`${shift.date.toISOString().slice(0, 10)}:${shift.period}`, shift]),
  )
  const deleteIds: string[] = []

  for (const [key, shift] of existingByKey) {
    if (shift.manualOverride) continue
    const expected = expectedByKey.get(key)
    if (expected && expected.status === shift.status) continue

    const date = shift.date.toISOString().slice(0, 10)
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay()
    const becameFree = !expected && (shift.status === "LIBRE" || (weekday === 6 && shift.status === "R1"))
    if (becameFree) {
      deleteIds.push(shift.id)
      continue
    }

    throw new Error(`Unexpected Soma row on ${key}: ${shift.status}; no rows were changed.`)
  }

  for (const key of expectedByKey.keys()) {
    if (!existingByKey.has(key)) throw new Error(`Missing scheduled Soma row ${key}; no rows were changed.`)
  }

  if (deleteIds.length > 0) {
    await prisma.shift.deleteMany({ where: { id: { in: deleteIds } } })
  }

  console.log(
    `Saturday rota reconciled: ${deleteIds.length} automatic rows removed; manual overrides and scheduled R1/TURNO rows preserved.`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
