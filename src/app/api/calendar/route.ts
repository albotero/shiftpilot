import { createCalendarEntrySchema, deleteCalendarEntrySchema } from "@/lib/calendar/create-schema"
import { getSomaAutomaticStatus, somaAnnualPlanSchema, type SomaAnnualPlan } from "@/lib/calendar/annual-plan"
import type { CalendarEntry, ShiftPeriod } from "@/lib/calendar/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"
type ShiftRecordPeriod = Exclude<ShiftPeriod, "AM + PM">

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function mapShift(shift: {
  id: string
  date: Date
  status: string
  period: ShiftRecordPeriod
  manualOverride: boolean
  anesthesiologist: string | null
  notes: string | null
}): CalendarEntry {
  return {
    id: shift.id,
    date: dateKey(shift.date),
    kind: "SOMA",
    status: shift.status as CalendarEntry["status"],
    period: shift.period,
    manualOverride: shift.manualOverride,
    ...(shift.anesthesiologist ? { anesthesiologist: shift.anesthesiologist } : {}),
    ...(shift.notes ? { notes: shift.notes } : {}),
    title: shift.status,
  }
}

export async function GET() {
  try {
    const [shifts, events, vacations] = await Promise.all([
      prisma.shift.findMany({ orderBy: [{ date: "asc" }, { period: "asc" }] }),
      prisma.event.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
      prisma.vacation.findMany({ orderBy: { startDate: "asc" } }),
    ])

    const entries: CalendarEntry[] = [
      ...shifts.map(mapShift),
      ...events.map((event) => ({
        id: event.id,
        date: dateKey(event.date),
        kind: event.category,
        title: event.title,
        ...(event.startTime ? { startTime: event.startTime } : {}),
        ...(event.durationMinutes ? { durationHours: event.durationMinutes / 60 } : {}),
        ...(event.location ? { location: event.location } : {}),
        ...(event.notes ? { notes: event.notes } : {}),
      })),
      ...vacations.map((vacation) => ({
        id: vacation.id,
        date: dateKey(vacation.startDate),
        ...(vacation.endDate ? { endDate: dateKey(vacation.endDate) } : {}),
        ...(vacation.annualPlanYear ? { annualPlanYear: vacation.annualPlanYear } : {}),
        kind: "VACACIONES" as const,
        title: "VACACIONES",
        ...(vacation.notes ? { notes: vacation.notes } : {}),
      })),
    ]

    return Response.json(entries)
  } catch {
    return Response.json({ error: "Base de datos local no disponible" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = createCalendarEntrySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Registro de calendario inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  const entry = parsed.data
  try {
    if (entry.kind === "SOMA") {
      const work = await prisma.work.findUnique({ where: { name: "Soma" } })
      if (!work || !entry.status || !entry.period) {
        return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })
      }
      const periods: ShiftRecordPeriod[] = entry.period === "AM + PM" ? ["AM", "PM"] : [entry.period]
      const date = new Date(`${entry.date}T00:00:00.000Z`)
      const existingShifts = (await prisma.shift.findMany({ where: { workId: work.id, date } })).filter((shift) =>
        periods.includes(shift.period),
      )
      if (existingShifts.some((shift) => shift.manualOverride)) {
        return Response.json(
          { error: "Ya existe un ajuste manual para esa jornada; edítalo desde el calendario." },
          { status: 409 },
        )
      }
      const existingByPeriod = new Map(existingShifts.map((shift) => [shift.period, shift]))
      const shifts = await prisma.$transaction(
        periods.map((period) => {
          const existing = existingByPeriod.get(period)
          const status = entry.status as
            | "LIBRE"
            | "R4"
            | "R3"
            | "R2"
            | "R1"
            | "R5"
            | "TURNO"
            | "NOCHE"
            | "TURNO_OTRA_PERSONA"
            | "TURNO_DE_OTRA_PERSONA"
            | "EXTERNO"
            | "EXTERNO_NOCHE"
          const data = {
            date,
            period,
            status,
            durationHours: period === "NOCHE" ? 12 : 6,
            manualOverride: true,
            anesthesiologist: entry.anesthesiologist || null,
            notes: entry.notes || null,
          }
          return existing
            ? prisma.shift.update({ where: { id: existing.id }, data })
            : prisma.shift.create({ data: { ...data, workId: work.id } })
        }),
      )
      return Response.json(shifts.map(mapShift), { status: 201 })
    }

    if (entry.kind === "VACACIONES") {
      const vacation = await prisma.vacation.create({
        data: {
          startDate: new Date(`${entry.date}T00:00:00.000Z`),
          endDate: new Date(`${entry.endDate ?? entry.date}T00:00:00.000Z`),
          notes: entry.notes,
        },
      })
      return Response.json(
        [
          {
            id: vacation.id,
            date: dateKey(vacation.startDate),
            ...(vacation.endDate ? { endDate: dateKey(vacation.endDate) } : {}),
            kind: "VACACIONES",
            title: "VACACIONES",
            ...(vacation.notes ? { notes: vacation.notes } : {}),
          },
        ],
        { status: 201 },
      )
    }

    const workName = entry.kind === "SEDARTE" ? "Sedarte" : undefined
    const work = workName ? await prisma.work.findUnique({ where: { name: workName } }) : null
    if (workName && !work) {
      return Response.json({ error: "Falta la configuración inicial de Sedarte" }, { status: 409 })
    }

    const event = await prisma.event.create({
      data: {
        workId: work?.id,
        category: entry.kind,
        title: entry.title,
        date: new Date(`${entry.date}T00:00:00.000Z`),
        startTime: entry.startTime,
        durationMinutes: entry.durationHours ? Math.round(entry.durationHours * 60) : null,
        location: entry.location,
        notes: entry.notes,
      },
    })

    return Response.json(
      [
        {
          id: event.id,
          date: dateKey(event.date),
          kind: event.category,
          title: event.title,
          ...(event.startTime ? { startTime: event.startTime } : {}),
          ...(event.durationMinutes ? { durationHours: event.durationMinutes / 60 } : {}),
          ...(event.location ? { location: event.location } : {}),
          ...(event.notes ? { notes: event.notes } : {}),
        },
      ],
      { status: 201 },
    )
  } catch (error) {
    const isUniqueConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
    return Response.json(
      { error: isUniqueConflict ? "Ya existe un registro para esa jornada" : "No se pudo guardar el registro" },
      { status: isUniqueConflict ? 409 : 503 },
    )
  }
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = createCalendarEntrySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Registro inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    if (parsed.data.kind === "SOMA") {
      if (!parsed.data.status || !parsed.data.period) {
        return Response.json({ error: "El turno Soma requiere tipo y jornada" }, { status: 400 })
      }
      const current = await prisma.shift.findUnique({ where: { id: parsed.data.id }, include: { work: true } })
      if (!current || current.work.name !== "Soma") {
        return Response.json({ error: "No se encontró el turno Soma que quieres editar" }, { status: 404 })
      }

      const targetDate = new Date(`${parsed.data.date}T00:00:00.000Z`)
      const sourceDate = dateKey(current.date)
      const sourceDay = await prisma.shift.findMany({
        where: { workId: current.workId, date: current.date },
      })
      const targetDay =
        sourceDate === parsed.data.date
          ? sourceDay
          : await prisma.shift.findMany({ where: { workId: current.workId, date: targetDate } })
      const requestedPeriods: ShiftRecordPeriod[] =
        parsed.data.period === "AM + PM" ? ["AM", "PM"] : [parsed.data.period]
      const pairedShift =
        parsed.data.period === "AM + PM"
          ? sourceDay.find(
              (shift) => shift.id !== current.id && shift.period !== current.period && shift.status === current.status,
            )
          : undefined
      const retainedIds = new Set([current.id, ...(pairedShift ? [pairedShift.id] : [])])
      const targetCollision = targetDay.some(
        (shift) => !retainedIds.has(shift.id) && requestedPeriods.includes(shift.period),
      )
      if (targetCollision) {
        return Response.json(
          { error: "La fecha destino ya tiene una jornada; no se modificó ningún turno." },
          { status: 409 },
        )
      }

      const updateData = {
        date: targetDate,
        status: parsed.data.status,
        durationHours: parsed.data.period === "NOCHE" ? 12 : 6,
        manualOverride: true,
        anesthesiologist: parsed.data.anesthesiologist || null,
        notes: parsed.data.notes || null,
      }
      const primaryPeriod = requestedPeriods.includes(current.period) ? current.period : requestedPeriods[0]
      const updatedShifts = await prisma.$transaction(
        requestedPeriods.map((period) => {
          const existingPeriod =
            period === primaryPeriod ? current : pairedShift?.period === period ? pairedShift : undefined
          if (existingPeriod) {
            return prisma.shift.update({
              where: { id: existingPeriod.id },
              data: { ...updateData, period },
            })
          }
          return prisma.shift.create({
            data: { ...updateData, workId: current.workId, period },
          })
        }),
      )
      return Response.json(updatedShifts.map(mapShift))
    }

    if (parsed.data.kind === "VACACIONES") {
      const current = await prisma.vacation.findUnique({ where: { id: parsed.data.id } })
      if (!current) return Response.json({ error: "No se encontró el período de vacaciones" }, { status: 404 })
      if (current.annualPlanYear) {
        return Response.json(
          { error: "Este período pertenece al plan anual; cámbialo desde Configuración de Soma" },
          { status: 409 },
        )
      }

      const vacation = await prisma.vacation.update({
        where: { id: current.id },
        data: {
          startDate: new Date(`${parsed.data.date}T00:00:00.000Z`),
          endDate: new Date(`${parsed.data.endDate ?? parsed.data.date}T00:00:00.000Z`),
          notes: parsed.data.notes,
        },
      })
      return Response.json([
        {
          id: vacation.id,
          date: dateKey(vacation.startDate),
          endDate: dateKey(vacation.endDate!),
          kind: "VACACIONES",
          title: "VACACIONES",
          ...(vacation.notes ? { notes: vacation.notes } : {}),
        },
      ])
    }

    const current = await prisma.event.findUnique({ where: { id: parsed.data.id } })
    if (!current || current.category !== parsed.data.kind) {
      return Response.json({ error: "No se encontró el evento" }, { status: 404 })
    }
    if (parsed.data.kind === "SEDARTE" && (!parsed.data.startTime || !parsed.data.durationHours)) {
      return Response.json({ error: "Los eventos Sedarte requieren hora y duración" }, { status: 400 })
    }
    if (parsed.data.kind === "PERSONAL" && Boolean(parsed.data.startTime) !== Boolean(parsed.data.durationHours)) {
      return Response.json({ error: "Indica hora y duración, o deja ambos campos vacíos" }, { status: 400 })
    }

    const event = await prisma.event.update({
      where: { id: current.id },
      data: {
        title: parsed.data.title,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        startTime: parsed.data.startTime ?? null,
        durationMinutes: parsed.data.durationHours ? Math.round(parsed.data.durationHours * 60) : null,
        location: parsed.data.location ?? null,
        notes: parsed.data.notes ?? null,
      },
    })
    return Response.json([
      {
        id: event.id,
        date: dateKey(event.date),
        kind: event.category,
        title: event.title,
        ...(event.startTime ? { startTime: event.startTime } : {}),
        ...(event.durationMinutes ? { durationHours: event.durationMinutes / 60 } : {}),
        ...(event.location ? { location: event.location } : {}),
        ...(event.notes ? { notes: event.notes } : {}),
      },
    ])
  } catch (error) {
    const isUniqueConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
    return Response.json(
      { error: isUniqueConflict ? "Ya existe un turno para esa jornada" : "No se pudo actualizar el turno" },
      { status: isUniqueConflict ? 409 : 503 },
    )
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = deleteCalendarEntrySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Tipo o identificador inválido" }, { status: 400 })

  try {
    if (parsed.data.kind === "SOMA") {
      const current = await prisma.shift.findUnique({ where: { id: parsed.data.id }, include: { work: true } })
      if (!current || current.work.name !== "Soma") {
        return Response.json({ error: "No se encontró el turno Soma" }, { status: 404 })
      }
      if (!current.manualOverride) {
        return Response.json({ error: "Este turno no tiene un ajuste manual que se pueda restaurar" }, { status: 409 })
      }

      const date = dateKey(current.date)
      const dayShifts = await prisma.shift.findMany({ where: { workId: current.workId, date: current.date } })
      const pairedShift =
        current.period === "NOCHE"
          ? undefined
          : dayShifts.find(
              (shift) =>
                shift.id !== current.id &&
                shift.manualOverride &&
                shift.period !== current.period &&
                shift.status === current.status,
            )
      const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: "soma.annualPlan." } } })
      const plans = new Map<number, SomaAnnualPlan>()
      for (const setting of settings) {
        const parsedPlan = somaAnnualPlanSchema.safeParse(setting.value)
        if (parsedPlan.success) plans.set(parsedPlan.data.year, parsedPlan.data)
      }

      const rotationStatus = getSomaAutomaticStatus(date, plans)
      const automaticStatus =
        current.period === "NOCHE" ? (rotationStatus === "TURNO" ? "NOCHE" : "LIBRE") : rotationStatus
      const restoredStatus = automaticStatus ?? "LIBRE"

      const shiftsToRestore = [current, ...(pairedShift ? [pairedShift] : [])]
      if (restoredStatus === "LIBRE") {
        await prisma.$transaction(shiftsToRestore.map((shift) => prisma.shift.delete({ where: { id: shift.id } })))
        return Response.json({ restored: true, entries: [], removedIds: shiftsToRestore.map((shift) => shift.id) })
      }

      const restoredShifts = await prisma.$transaction(
        shiftsToRestore.map((shift) =>
          prisma.shift.update({
            where: { id: shift.id },
            data: {
              status: restoredStatus,
              durationHours: shift.period === "NOCHE" ? 12 : 6,
              manualOverride: false,
              anesthesiologist: null,
            },
          }),
        ),
      )
      return Response.json({ restored: true, entries: restoredShifts.map(mapShift), removedIds: [] })
    }

    if (parsed.data.kind === "VACACIONES") {
      const vacation = await prisma.vacation.findUnique({ where: { id: parsed.data.id } })
      if (!vacation) return Response.json({ error: "No se encontró el período de vacaciones" }, { status: 404 })
      if (vacation.annualPlanYear) {
        return Response.json(
          { error: "Este período pertenece al plan anual y no se puede eliminar desde el calendario" },
          { status: 409 },
        )
      }
      await prisma.vacation.delete({ where: { id: vacation.id } })
    } else {
      const event = await prisma.event.findUnique({ where: { id: parsed.data.id } })
      if (!event || event.category !== parsed.data.kind) {
        return Response.json({ error: "No se encontró el evento" }, { status: 404 })
      }
      await prisma.event.delete({ where: { id: event.id } })
    }

    return Response.json({ deleted: true, id: parsed.data.id })
  } catch {
    return Response.json({ error: "No se pudo eliminar el registro" }, { status: 503 })
  }
}
