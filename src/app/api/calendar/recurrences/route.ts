import type { RecurrencePeriod as DatabaseRecurrencePeriod } from "@prisma/client"
import type { RecurrenceFrequency as DatabaseRecurrenceFrequency } from "@prisma/client"
import { z } from "zod"
import {
  expandWeeklyRecurrence,
  type CalendarRecurringRule,
  type WeeklyRecurrenceOverride,
} from "@/lib/calendar/recurrence"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const recurrenceSchema = z
  .object({
    id: z.string().min(1).optional(),
    recurrenceId: z.string().min(1).optional(),
    date: z.iso.date(),
    recurrenceStartDate: z.iso.date().optional(),
    kind: z.enum(["SOMA", "PERSONAL"]),
    repeatWeekly: z.literal(true),
    recurrenceFrequency: z.enum(["WEEKLY", "MONTHLY", "INTERVAL"]).default("WEEKLY"),
    recurrenceWeekday: z.number().int().min(0).max(6).optional(),
    recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    recurrenceDayOfMonth: z.number().int().min(1).max(31).optional(),
    recurrenceLastDayOfMonth: z.boolean().default(false),
    recurrenceIntervalDays: z.number().int().min(1).max(3650).optional(),
    recurrenceEndDate: z.union([z.iso.date(), z.null()]).optional(),
    skipHolidays: z.boolean().default(false),
    status: z.enum(["R4", "R3", "R2", "R1", "R5", "TURNO", "NOCHE", "EXTERNO", "EXTERNO_NOCHE"]).optional(),
    recurrencePeriod: z.enum(["AM", "PM", "AM_PM", "NOCHE"]).optional(),
    recurrenceEditScope: z.enum(["OCCURRENCE", "THIS_AND_FUTURE"]).default("THIS_AND_FUTURE"),
    title: z.string().trim().min(1).max(80),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    durationHours: z.number().positive().max(24).optional(),
    location: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((rule, context) => {
    const recurrenceStartDate = rule.recurrenceStartDate ?? rule.date
    if (rule.recurrenceEndDate && rule.recurrenceEndDate < recurrenceStartDate) {
      context.addIssue({
        code: "custom",
        message: "La fecha final debe ser igual o posterior al inicio",
        path: ["recurrenceEndDate"],
      })
    }
    const weekdays = rule.recurrenceWeekdays.length
      ? rule.recurrenceWeekdays
      : rule.recurrenceWeekday === undefined
        ? []
        : [rule.recurrenceWeekday]
    if (rule.recurrenceFrequency === "WEEKLY" && weekdays.length === 0) {
      context.addIssue({ code: "custom", message: "Selecciona al menos un día semanal", path: ["recurrenceWeekdays"] })
    }
    if (rule.recurrenceFrequency === "MONTHLY" && !rule.recurrenceLastDayOfMonth && !rule.recurrenceDayOfMonth) {
      context.addIssue({ code: "custom", message: "Selecciona el día del mes", path: ["recurrenceDayOfMonth"] })
    }
    if (rule.recurrenceFrequency === "INTERVAL" && !rule.recurrenceIntervalDays) {
      context.addIssue({
        code: "custom",
        message: "Indica cada cuántos días repetir",
        path: ["recurrenceIntervalDays"],
      })
    }
    if (rule.kind === "SOMA" && (!rule.status || !rule.recurrencePeriod)) {
      context.addIssue({ code: "custom", message: "El turno repetible requiere estado y jornada", path: ["status"] })
    }
    if (rule.kind === "PERSONAL" && (rule.status || rule.recurrencePeriod)) {
      context.addIssue({
        code: "custom",
        message: "El evento personal no acepta estado ni jornada Soma",
        path: ["status"],
      })
    }
    if (rule.kind === "SOMA" && Boolean(rule.startTime || rule.durationHours)) {
      context.addIssue({ code: "custom", message: "Un turno Soma no acepta horario de evento", path: ["startTime"] })
    }
    if (rule.kind === "PERSONAL" && Boolean(rule.startTime) !== Boolean(rule.durationHours)) {
      context.addIssue({ code: "custom", message: "El horario personal requiere hora y duración", path: ["startTime"] })
    }
  })

function parseRange(request: Request) {
  const search = new URL(request.url).searchParams
  const from = search.get("from")
  const to = search.get("to")
  if (!from || !to || !z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success || to < from) {
    return null
  }
  const startTime = new Date(`${from}T12:00:00.000Z`).getTime()
  const endTime = new Date(`${to}T12:00:00.000Z`).getTime()
  const dayCount = (endTime - startTime) / 86_400_000
  if (!Number.isInteger(dayCount) || dayCount > 400) return null
  return { from, to, fromDate: new Date(`${from}T00:00:00.000Z`), toDate: new Date(`${to}T00:00:00.000Z`) }
}

function mapRule(rule: {
  id: string
  kind: string
  frequency: string
  startDate: Date
  endDate: Date | null
  weekday: number | null
  weekdays: number[]
  dayOfMonth: number | null
  lastDayOfMonth: boolean
  intervalDays: number | null
  skipHolidays: boolean
  title: string
  status: string | null
  period: string | null
  startTime: string | null
  durationMinutes: number | null
  location: string | null
  notes: string | null
}): CalendarRecurringRule {
  return {
    id: rule.id,
    kind: rule.kind as CalendarRecurringRule["kind"],
    frequency: rule.frequency as CalendarRecurringRule["frequency"],
    startDate: rule.startDate.toISOString().slice(0, 10),
    endDate: rule.endDate?.toISOString().slice(0, 10) ?? null,
    weekday: rule.weekday ?? undefined,
    weekdays: rule.weekdays.length ? rule.weekdays : rule.weekday == null ? [] : [rule.weekday],
    dayOfMonth: rule.dayOfMonth,
    lastDayOfMonth: rule.lastDayOfMonth,
    intervalDays: rule.intervalDays,
    skipHolidays: rule.skipHolidays,
    title: rule.title,
    ...(rule.status ? { status: rule.status as CalendarRecurringRule["status"] } : {}),
    ...(rule.period ? { period: rule.period as CalendarRecurringRule["period"] } : {}),
    ...(rule.startTime ? { startTime: rule.startTime } : {}),
    ...(rule.durationMinutes ? { durationMinutes: rule.durationMinutes } : {}),
    ...(rule.location ? { location: rule.location } : {}),
    ...(rule.notes ? { notes: rule.notes } : {}),
  }
}

function mapOverride(exception: {
  date: Date
  title: string
  status: string | null
  period: string | null
  startTime: string | null
  durationMinutes: number | null
  location: string | null
  notes: string | null
}): WeeklyRecurrenceOverride {
  return {
    date: exception.date.toISOString().slice(0, 10),
    title: exception.title,
    status: exception.status as WeeklyRecurrenceOverride["status"],
    period: exception.period as WeeklyRecurrenceOverride["period"],
    startTime: exception.startTime,
    durationMinutes: exception.durationMinutes,
    location: exception.location,
    notes: exception.notes,
  }
}

function recurrenceData(
  rule: z.infer<typeof recurrenceSchema>,
  workId: string | null,
  startDate = rule.recurrenceStartDate ?? rule.date,
) {
  const period: DatabaseRecurrencePeriod | null =
    rule.kind === "SOMA" ? (rule.recurrencePeriod === "AM_PM" ? "AM_PM" : (rule.recurrencePeriod ?? null)) : null
  const weekdays = rule.recurrenceWeekdays.length
    ? rule.recurrenceWeekdays
    : rule.recurrenceWeekday === undefined
      ? []
      : [rule.recurrenceWeekday]
  const frequency: DatabaseRecurrenceFrequency = rule.recurrenceFrequency
  return {
    kind: rule.kind,
    workId,
    frequency,
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: rule.recurrenceEndDate ? new Date(`${rule.recurrenceEndDate}T00:00:00.000Z`) : null,
    weekday: weekdays[0] ?? null,
    weekdays,
    dayOfMonth:
      rule.recurrenceFrequency === "MONTHLY" && !rule.recurrenceLastDayOfMonth
        ? (rule.recurrenceDayOfMonth ?? null)
        : null,
    lastDayOfMonth: rule.recurrenceFrequency === "MONTHLY" && rule.recurrenceLastDayOfMonth,
    intervalDays: rule.recurrenceFrequency === "INTERVAL" ? (rule.recurrenceIntervalDays ?? null) : null,
    skipHolidays: rule.skipHolidays,
    title: rule.title,
    status: rule.kind === "SOMA" ? (rule.status ?? null) : null,
    period,
    startTime: rule.kind === "PERSONAL" ? (rule.startTime ?? null) : null,
    durationMinutes: rule.kind === "PERSONAL" && rule.durationHours ? Math.round(rule.durationHours * 60) : null,
    location: rule.location || null,
    notes: rule.notes || null,
  }
}

function recurrenceOverrideData(rule: z.infer<typeof recurrenceSchema>) {
  const period: DatabaseRecurrencePeriod | null =
    rule.kind === "SOMA" ? (rule.recurrencePeriod === "AM_PM" ? "AM_PM" : (rule.recurrencePeriod ?? null)) : null
  return {
    title: rule.title,
    status: rule.kind === "SOMA" ? (rule.status ?? null) : null,
    period,
    startTime: rule.kind === "PERSONAL" ? (rule.startTime ?? null) : null,
    durationMinutes: rule.kind === "PERSONAL" && rule.durationHours ? Math.round(rule.durationHours * 60) : null,
    location: rule.location || null,
    notes: rule.notes || null,
  }
}

function previousDate(date: Date) {
  const previous = new Date(date)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous
}

async function parseRule(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { response: Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 }) }
  }
  const parsed = recurrenceSchema.safeParse(body)
  if (!parsed.success) {
    return {
      response: Response.json({ error: "Regla recurrente inválida", details: parsed.error.flatten() }, { status: 400 }),
    }
  }
  return { data: parsed.data }
}

async function getWorkId(rule: z.infer<typeof recurrenceSchema>) {
  if (rule.kind !== "SOMA") return null
  const work = await prisma.work.findUnique({ where: { name: "Soma" } })
  return work?.id ?? undefined
}

export async function GET(request: Request) {
  const range = parseRange(request)
  if (!range) return Response.json({ error: "Rango de fechas inválido o demasiado amplio" }, { status: 400 })
  try {
    const rules = await prisma.calendarRecurrence.findMany({
      where: {
        startDate: { lte: range.toDate },
        OR: [{ endDate: null }, { endDate: { gte: range.fromDate } }],
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    })
    const exceptions = rules.length
      ? await prisma.calendarRecurrenceException.findMany({
          where: {
            recurrenceId: { in: rules.map((rule) => rule.id) },
            date: { gte: range.fromDate, lte: range.toDate },
          },
        })
      : []
    return Response.json(
      rules.flatMap((rule) =>
        expandWeeklyRecurrence(
          mapRule(rule),
          range.from,
          range.to,
          exceptions.filter((exception) => exception.recurrenceId === rule.id).map(mapOverride),
        ),
      ),
    )
  } catch {
    return Response.json({ error: "No se pudieron consultar las recurrencias" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const parsed = await parseRule(request)
  if (parsed.response) return parsed.response
  try {
    const workId = await getWorkId(parsed.data)
    if (parsed.data.kind === "SOMA" && !workId) {
      return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })
    }
    const recurrence = await prisma.calendarRecurrence.create({
      data: recurrenceData(parsed.data, workId ?? null),
    })
    return Response.json({ id: recurrence.id }, { status: 201 })
  } catch {
    return Response.json({ error: "No se pudo guardar la recurrencia" }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const parsed = await parseRule(request)
  if (parsed.response) return parsed.response
  if (!parsed.data.recurrenceId) {
    return Response.json({ error: "Falta el identificador de la recurrencia" }, { status: 400 })
  }
  try {
    const workId = await getWorkId(parsed.data)
    if (parsed.data.kind === "SOMA" && !workId) {
      return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })
    }
    const occurrenceDate = new Date(`${parsed.data.date}T00:00:00.000Z`)
    const currentRule = await prisma.calendarRecurrence.findUnique({ where: { id: parsed.data.recurrenceId } })
    if (!currentRule) return Response.json({ error: "No se encontró la recurrencia" }, { status: 404 })
    if (occurrenceDate < currentRule.startDate || (currentRule.endDate && occurrenceDate > currentRule.endDate)) {
      return Response.json({ error: "La fecha no pertenece al rango de esta serie" }, { status: 400 })
    }

    if (parsed.data.recurrenceEditScope === "OCCURRENCE") {
      const exception = await prisma.calendarRecurrenceException.upsert({
        where: {
          recurrenceId_date: { recurrenceId: parsed.data.recurrenceId, date: occurrenceDate },
        },
        create: {
          recurrenceId: parsed.data.recurrenceId,
          date: occurrenceDate,
          ...recurrenceOverrideData(parsed.data),
        },
        update: recurrenceOverrideData(parsed.data),
      })
      return Response.json({ id: parsed.data.recurrenceId, exceptionId: exception.id, scope: "OCCURRENCE" })
    }

    if (occurrenceDate.getTime() <= currentRule.startDate.getTime()) {
      const recurrence = await prisma.$transaction(async (transaction) => {
        await transaction.calendarRecurrenceException.deleteMany({
          where: { recurrenceId: currentRule.id, date: { gte: occurrenceDate } },
        })
        return transaction.calendarRecurrence.update({
          where: { id: currentRule.id },
          data: recurrenceData(parsed.data, workId ?? null, parsed.data.date),
        })
      })
      return Response.json({ id: recurrence.id, scope: "THIS_AND_FUTURE" })
    }

    const recurrence = await prisma.$transaction(async (transaction) => {
      await transaction.calendarRecurrence.update({
        where: { id: currentRule.id },
        data: { endDate: previousDate(occurrenceDate) },
      })
      await transaction.calendarRecurrenceException.deleteMany({
        where: { recurrenceId: currentRule.id, date: { gte: occurrenceDate } },
      })
      return transaction.calendarRecurrence.create({
        data: recurrenceData(parsed.data, workId ?? null, parsed.data.date),
      })
    })
    return Response.json({ id: recurrence.id, previousSeriesId: currentRule.id, scope: "THIS_AND_FUTURE" })
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return Response.json({ error: "No se encontró la recurrencia" }, { status: 404 })
    }
    return Response.json({ error: "No se pudo actualizar la recurrencia" }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }
  const parsed = z
    .object({
      id: z.string().min(1),
      scope: z.enum(["ALL", "FUTURE"]).default("ALL"),
      date: z.iso.date().optional(),
    })
    .safeParse(body)
  if (!parsed.success) return Response.json({ error: "Identificador inválido" }, { status: 400 })
  try {
    if (parsed.data.scope === "ALL") {
      await prisma.calendarRecurrence.delete({ where: { id: parsed.data.id } })
      return Response.json({ deleted: true, id: parsed.data.id, scope: "ALL" })
    }
    if (!parsed.data.date) return Response.json({ error: "Falta la fecha desde la que eliminar" }, { status: 400 })
    const occurrenceDate = new Date(`${parsed.data.date}T00:00:00.000Z`)
    const currentRule = await prisma.calendarRecurrence.findUnique({ where: { id: parsed.data.id } })
    if (!currentRule) return Response.json({ error: "No se encontró la recurrencia" }, { status: 404 })
    if (currentRule.endDate && occurrenceDate > currentRule.endDate) {
      return Response.json({ error: "La fecha supera el fin de esta serie" }, { status: 400 })
    }
    if (occurrenceDate.getTime() <= currentRule.startDate.getTime()) {
      await prisma.calendarRecurrence.delete({ where: { id: currentRule.id } })
    } else {
      await prisma.$transaction(async (transaction) => {
        await transaction.calendarRecurrence.update({
          where: { id: currentRule.id },
          data: { endDate: previousDate(occurrenceDate) },
        })
        await transaction.calendarRecurrenceException.deleteMany({
          where: { recurrenceId: currentRule.id, date: { gte: occurrenceDate } },
        })
      })
    }
    return Response.json({ deleted: true, id: parsed.data.id, scope: "FUTURE" })
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return Response.json({ error: "No se encontró la recurrencia" }, { status: 404 })
    }
    return Response.json({ error: "No se pudo eliminar la recurrencia" }, { status: 503 })
  }
}
