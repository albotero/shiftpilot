import { createCalendarEntrySchema, deleteCalendarEntrySchema } from "@/lib/calendar/create-schema"
import { getSomaAutomaticStatus, somaAnnualPlanSchema, type SomaAnnualPlan } from "@/lib/calendar/annual-plan"
import type { CalendarEntry, ShiftPeriod } from "@/lib/calendar/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"
type ShiftRecordPeriod = Exclude<ShiftPeriod, "AM + PM">
type CoverageEntry = Pick<
  CalendarEntry,
  "status" | "period" | "replacementPersonId" | "amReplacementPersonId" | "pmReplacementPersonId"
>

function replacementIdForPeriod(entry: CoverageEntry, period: ShiftRecordPeriod) {
  if (entry.period === "AM + PM") {
    return period === "AM"
      ? (entry.amReplacementPersonId ?? entry.replacementPersonId)
      : period === "PM"
        ? (entry.pmReplacementPersonId ?? entry.replacementPersonId)
        : entry.replacementPersonId
  }
  return entry.replacementPersonId
}

async function resolveReplacementPeople(entry: CoverageEntry) {
  const ids = [entry.replacementPersonId, entry.amReplacementPersonId, entry.pmReplacementPersonId].filter(
    (id): id is string => Boolean(id),
  )
  const uniqueIds = [...new Set(ids)]
  const people = await Promise.all(uniqueIds.map((id) => prisma.replacementPerson.findUnique({ where: { id } })))
  return {
    byId: new Map(people.filter((person) => person !== null).map((person) => [person.id, person])),
    hasMissing: people.some((person) => !person),
    hasInactive: people.some((person) => person && !person.active),
  }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

async function getSomaAnnualPlans() {
  const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: "soma.annualPlan." } } })
  const plans = new Map<number, SomaAnnualPlan>()
  for (const setting of settings) {
    const parsed = somaAnnualPlanSchema.safeParse(setting.value)
    if (parsed.success) plans.set(parsed.data.year, parsed.data)
  }
  return plans
}

function getAutomaticShiftStatus(date: string, period: ShiftRecordPeriod, plans: ReadonlyMap<number, SomaAnnualPlan>) {
  const rotationStatus = getSomaAutomaticStatus(date, plans)
  if (!rotationStatus || rotationStatus === "LIBRE") return undefined
  if (period === "NOCHE") return rotationStatus === "TURNO" ? "NOCHE" : undefined
  return rotationStatus
}

function mapShift(shift: {
  id: string
  date: Date
  status: string
  period: ShiftRecordPeriod
  manualOverride: boolean
  anesthesiologist: string | null
  notes: string | null
  reminderEnabled: boolean
  reminderMode: CalendarEntry["reminderMode"]
  reminderMinutesBefore: number
  coverages?: { person: { id: string; name: string } }[]
}): CalendarEntry {
  const replacement = shift.coverages?.[0]?.person
  return {
    id: shift.id,
    date: dateKey(shift.date),
    kind: "SOMA",
    status: shift.status as CalendarEntry["status"],
    period: shift.period,
    manualOverride: shift.manualOverride,
    ...(replacement
      ? { replacementPersonId: replacement.id, anesthesiologist: replacement.name }
      : shift.anesthesiologist
        ? { anesthesiologist: shift.anesthesiologist }
        : {}),
    ...(shift.notes ? { notes: shift.notes } : {}),
    reminderEnabled: shift.reminderEnabled,
    reminderMode: shift.reminderMode,
    reminderMinutesBefore: shift.reminderMinutesBefore,
    title: shift.status,
  }
}

export async function GET() {
  try {
    const [shifts, events, vacations] = await Promise.all([
      prisma.shift.findMany({
        include: { coverages: { include: { person: true } } },
        orderBy: [{ date: "asc" }, { period: "asc" }],
      }),
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
        reminderEnabled: event.reminderEnabled,
        reminderMode: event.reminderMode,
        reminderMinutesBefore: event.reminderMinutesBefore,
      })),
      ...vacations.map((vacation) => ({
        id: vacation.id,
        date: dateKey(vacation.startDate),
        ...(vacation.endDate ? { endDate: dateKey(vacation.endDate) } : {}),
        ...(vacation.annualPlanYear ? { annualPlanYear: vacation.annualPlanYear } : {}),
        reminderEnabled: vacation.reminderEnabled,
        reminderMode: vacation.reminderMode,
        reminderMinutesBefore: vacation.reminderMinutesBefore,
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
      const isCoverage = entry.status === "TURNO_OTRA_PERSONA" || entry.status === "TURNO_DE_OTRA_PERSONA"
      const hasReplacement = Boolean(
        entry.replacementPersonId || entry.amReplacementPersonId || entry.pmReplacementPersonId,
      )
      if (hasReplacement && !isCoverage) {
        return Response.json({ error: "La persona sólo se puede asignar a un turno cubierto" }, { status: 400 })
      }
      if ((entry.amReplacementPersonId || entry.pmReplacementPersonId) && entry.period !== "AM + PM") {
        return Response.json({ error: "Las personas AM y PM requieren una jornada AM + PM" }, { status: 400 })
      }
      const { byId: replacementsById, hasMissing, hasInactive } = await resolveReplacementPeople(entry)
      if (hasMissing || hasInactive) {
        return Response.json({ error: "El anestesiólogo no existe o está inactivo" }, { status: 404 })
      }
      const work = await prisma.work.findUnique({ where: { name: "Soma" } })
      if (!work || (!entry.status && !entry.restoreAutomatic) || !entry.period) {
        return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })
      }
      const periods: ShiftRecordPeriod[] = entry.period === "AM + PM" ? ["AM", "PM"] : [entry.period]
      const date = new Date(`${entry.date}T00:00:00.000Z`)
      const automaticPlans = entry.restoreAutomatic ? await getSomaAnnualPlans() : undefined
      const statusByPeriod = new Map<ShiftRecordPeriod, NonNullable<CalendarEntry["status"]>>()
      for (const period of periods) {
        const status = entry.restoreAutomatic
          ? automaticPlans && getAutomaticShiftStatus(entry.date, period, automaticPlans)
          : entry.status
        if (!status) {
          return Response.json({ error: "No hay un turno automático programado para esa jornada." }, { status: 409 })
        }
        statusByPeriod.set(period, status)
      }
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
          const status = statusByPeriod.get(period)!
          const replacementId = replacementIdForPeriod(entry, period)
          const replacement = replacementId ? replacementsById.get(replacementId) : undefined
          const data = {
            date,
            period,
            status,
            durationHours: period === "NOCHE" ? 12 : 6,
            manualOverride: !entry.restoreAutomatic,
            anesthesiologist: entry.restoreAutomatic ? null : replacement?.name || entry.anesthesiologist || null,
            notes: entry.notes || null,
            reminderEnabled: entry.reminderEnabled,
            reminderMode: entry.reminderMode,
            reminderMinutesBefore: entry.reminderMinutesBefore,
          }
          const coverageWrite = {
            coverages: {
              deleteMany: {},
              ...(!entry.restoreAutomatic && replacement
                ? { create: { person: { connect: { id: replacement.id } } } }
                : {}),
            },
          }
          return existing
            ? prisma.shift.update({
                where: { id: existing.id },
                data: { ...data, ...coverageWrite },
                include: { coverages: { include: { person: true } } },
              })
            : prisma.shift.create({
                data: {
                  ...data,
                  workId: work.id,
                  ...(!entry.restoreAutomatic && replacement
                    ? { coverages: { create: { person: { connect: { id: replacement.id } } } } }
                    : {}),
                },
                include: { coverages: { include: { person: true } } },
              })
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
          reminderEnabled: entry.reminderEnabled,
          reminderMode: entry.reminderMode,
          reminderMinutesBefore: entry.reminderMinutesBefore,
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
            reminderEnabled: vacation.reminderEnabled,
            reminderMode: vacation.reminderMode,
            reminderMinutesBefore: vacation.reminderMinutesBefore,
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
        reminderEnabled: entry.reminderEnabled,
        reminderMode: entry.reminderMode,
        reminderMinutesBefore: entry.reminderMinutesBefore,
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
          reminderEnabled: event.reminderEnabled,
          reminderMode: event.reminderMode,
          reminderMinutesBefore: event.reminderMinutesBefore,
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
      if ((!parsed.data.status && !parsed.data.restoreAutomatic) || !parsed.data.period) {
        return Response.json({ error: "El turno Soma requiere tipo y jornada" }, { status: 400 })
      }
      const isCoverage = parsed.data.status === "TURNO_OTRA_PERSONA" || parsed.data.status === "TURNO_DE_OTRA_PERSONA"
      const hasReplacement = Boolean(
        parsed.data.replacementPersonId || parsed.data.amReplacementPersonId || parsed.data.pmReplacementPersonId,
      )
      if (hasReplacement && (!isCoverage || parsed.data.restoreAutomatic)) {
        return Response.json({ error: "La persona sólo se puede asignar a un turno cubierto" }, { status: 400 })
      }
      if (
        (parsed.data.amReplacementPersonId || parsed.data.pmReplacementPersonId) &&
        parsed.data.period !== "AM + PM"
      ) {
        return Response.json({ error: "Las personas AM y PM requieren una jornada AM + PM" }, { status: 400 })
      }
      const { byId: replacementsById, hasMissing } = await resolveReplacementPeople(parsed.data)
      if (hasMissing) {
        return Response.json({ error: "El anestesiólogo no existe o está inactivo" }, { status: 404 })
      }
      const current = await prisma.shift.findUnique({
        where: { id: parsed.data.id },
        include: { work: true, coverages: true },
      })
      if (!current || current.work.name !== "Soma") {
        return Response.json({ error: "No se encontró el turno Soma que quieres editar" }, { status: 404 })
      }

      const targetDate = new Date(`${parsed.data.date}T00:00:00.000Z`)
      const sourceDate = dateKey(current.date)
      const sourceDay = await prisma.shift.findMany({
        where: { workId: current.workId, date: current.date },
        include: { coverages: true },
      })
      const targetDay =
        sourceDate === parsed.data.date
          ? sourceDay
          : await prisma.shift.findMany({ where: { workId: current.workId, date: targetDate } })
      const requestedPeriods: ShiftRecordPeriod[] =
        parsed.data.period === "AM + PM" ? ["AM", "PM"] : [parsed.data.period]
      const statusByPeriod = new Map<ShiftRecordPeriod, NonNullable<CalendarEntry["status"]>>()
      const automaticPlans = parsed.data.restoreAutomatic ? await getSomaAnnualPlans() : undefined
      for (const period of requestedPeriods) {
        const status = parsed.data.restoreAutomatic
          ? automaticPlans && getAutomaticShiftStatus(parsed.data.date, period, automaticPlans)
          : parsed.data.status
        if (!status) {
          return Response.json({ error: "No hay un turno automático programado para esa jornada." }, { status: 409 })
        }
        statusByPeriod.set(period, status)
      }
      const pairedShift =
        parsed.data.period === "AM + PM"
          ? sourceDay.find(
              (shift) =>
                shift.id !== current.id &&
                shift.period !== current.period &&
                (parsed.data.restoreAutomatic || shift.status === parsed.data.status),
            )
          : undefined
      const primaryPeriod = requestedPeriods.includes(current.period) ? current.period : requestedPeriods[0]
      const inactiveReplacementIsNew = requestedPeriods.some((period) => {
        const replacementId = replacementIdForPeriod(parsed.data, period)
        const replacement = replacementId ? replacementsById.get(replacementId) : undefined
        if (!replacement || replacement.active) return false
        const existingPeriod =
          period === primaryPeriod ? current : pairedShift?.period === period ? pairedShift : undefined
        return !existingPeriod?.coverages.some((coverage) => coverage.personId === replacement.id)
      })
      if (inactiveReplacementIsNew) {
        return Response.json(
          { error: "El anestesiólogo está inactivo y no se puede asignar a una nueva jornada" },
          { status: 404 },
        )
      }
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
        notes: parsed.data.notes || null,
        reminderEnabled: parsed.data.reminderEnabled,
        reminderMode: parsed.data.reminderMode,
        reminderMinutesBefore: parsed.data.reminderMinutesBefore,
      }
      const updatedShifts = await prisma.$transaction(
        requestedPeriods.map((period) => {
          const status = statusByPeriod.get(period)!
          const replacementId = replacementIdForPeriod(parsed.data, period)
          const replacement = replacementId ? replacementsById.get(replacementId) : undefined
          const existingPeriod =
            period === primaryPeriod ? current : pairedShift?.period === period ? pairedShift : undefined
          const periodUpdateData = {
            ...updateData,
            status,
            durationHours: period === "NOCHE" ? 12 : 6,
            manualOverride: !parsed.data.restoreAutomatic,
            anesthesiologist: parsed.data.restoreAutomatic
              ? null
              : replacement?.name || parsed.data.anesthesiologist || null,
            ...(existingPeriod
              ? {
                  coverages: {
                    deleteMany: {},
                    ...(!parsed.data.restoreAutomatic && replacement
                      ? { create: { person: { connect: { id: replacement.id } } } }
                      : {}),
                  },
                }
              : !parsed.data.restoreAutomatic && replacement
                ? { coverages: { create: { person: { connect: { id: replacement.id } } } } }
                : {}),
          }
          if (existingPeriod) {
            return prisma.shift.update({
              where: { id: existingPeriod.id },
              data: { ...periodUpdateData, period },
              include: { coverages: { include: { person: true } } },
            })
          }
          return prisma.shift.create({
            data: {
              ...periodUpdateData,
              workId: current.workId,
              period,
            },
            include: { coverages: { include: { person: true } } },
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
          reminderEnabled: parsed.data.reminderEnabled,
          reminderMode: parsed.data.reminderMode,
          reminderMinutesBefore: parsed.data.reminderMinutesBefore,
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
          reminderEnabled: vacation.reminderEnabled,
          reminderMode: vacation.reminderMode,
          reminderMinutesBefore: vacation.reminderMinutesBefore,
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
        reminderEnabled: parsed.data.reminderEnabled,
        reminderMode: parsed.data.reminderMode,
        reminderMinutesBefore: parsed.data.reminderMinutesBefore,
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
        reminderEnabled: event.reminderEnabled,
        reminderMode: event.reminderMode,
        reminderMinutesBefore: event.reminderMinutesBefore,
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
              coverages: { deleteMany: {} },
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
