import { somaShiftWindows } from "@/lib/calendar/availability"
import type { CalendarEntry } from "@/lib/calendar/types"

const COLOMBIA_OFFSET = "-05:00"
const DAY_REMINDER_GRACE_MS = 15 * 60_000

export type ReminderSchedule = { eventAt: Date; dueAt: Date }

export type ReminderDeliveryStore = {
  claim: (eventKey: string, dueAt: Date, claimedUntil: Date) => Promise<boolean>
  markSent: (eventKey: string, sentAt: Date) => Promise<void>
  markFailed: (eventKey: string, error: string) => Promise<void>
}

function getEntryStartTime(entry: CalendarEntry) {
  if (entry.kind === "SOMA") {
    const period = entry.period === "AM + PM" ? "AM" : (entry.period ?? "AM")
    return somaShiftWindows[period]?.startTime
  }
  return entry.startTime
}

function atColombiaTime(date: string, time: string) {
  return new Date(`${date}T${time}:00${COLOMBIA_OFFSET}`)
}

export function getReminderSchedule(entry: CalendarEntry, now: Date): ReminderSchedule | null {
  if (!entry.reminderEnabled) return null

  const startTime = getEntryStartTime(entry)
  const eventAt = atColombiaTime(entry.date, startTime ?? "05:00")
  const isDayAtFive = entry.reminderMode === "DAY_AT_5_AM"
  const dueAt = isDayAtFive
    ? atColombiaTime(entry.date, "05:00")
    : new Date(eventAt.getTime() - (entry.reminderMinutesBefore ?? 60) * 60_000)

  if (dueAt > now) return null
  if (isDayAtFive) {
    if (now.getTime() - dueAt.getTime() > DAY_REMINDER_GRACE_MS) return null
    if (startTime && eventAt <= now) return null
    if (startTime && eventAt < dueAt) return null
  }
  if (!isDayAtFive && eventAt <= now) return null

  return { eventAt, dueAt }
}

function getKindLabel(entry: CalendarEntry) {
  if (entry.kind === "SOMA") return "Turno Soma"
  if (entry.kind === "SEDARTE") return "Evento Sedarte"
  if (entry.kind === "PERSONAL") return "Evento personal"
  return "Vacaciones"
}

export function buildReminderMessage(entry: CalendarEntry) {
  const dateLabel = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${entry.date}T12:00:00.000Z`))
  const startTime = getEntryStartTime(entry)
  const details = [
    entry.kind === "SOMA" && entry.period ? `Jornada: ${entry.period}` : null,
    startTime ? `Hora: ${startTime}` : entry.kind === "VACACIONES" ? null : "Hora estimada: 05:00 a. m.",
    entry.location ? `Lugar: ${entry.location}` : null,
  ].filter((detail): detail is string => detail !== null)

  return [
    "Recordatorio de ShiftPilot",
    `${getKindLabel(entry)}: ${entry.title}`,
    `Fecha: ${dateLabel}`,
    ...details,
  ].join("\n")
}

export function getReminderEventKey(entry: CalendarEntry) {
  return `calendar:${entry.kind}:${entry.id}:${entry.date}`
}

export async function runDueReminders(
  entries: readonly CalendarEntry[],
  now: Date,
  store: ReminderDeliveryStore,
  send: (message: string) => Promise<void>,
) {
  const result = { sent: 0, skipped: 0, failed: 0 }
  for (const entry of entries) {
    const schedule = getReminderSchedule(entry, now)
    if (!schedule) {
      result.skipped += 1
      continue
    }

    const eventKey = getReminderEventKey(entry)
    const claimedUntil = new Date(now.getTime() + 120_000)
    if (!(await store.claim(eventKey, schedule.dueAt, claimedUntil))) {
      result.skipped += 1
      continue
    }

    try {
      await send(buildReminderMessage(entry))
      await store.markSent(eventKey, now)
      result.sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al enviar Telegram"
      await store.markFailed(eventKey, message.slice(0, 1000))
      result.failed += 1
    }
  }
  return result
}
