import { getColombianHoliday } from "./colombian-holidays"
import type { CalendarEntry, CalendarEntryKind, SomaStatus } from "./types"

export type RecurrenceFrequency = "WEEKLY" | "MONTHLY" | "INTERVAL"

export type CalendarRecurringRule = {
  id: string
  kind: Extract<CalendarEntryKind, "SOMA" | "PERSONAL">
  frequency?: RecurrenceFrequency
  startDate: string
  endDate: string | null
  weekday?: number
  weekdays?: number[]
  dayOfMonth?: number | null
  lastDayOfMonth?: boolean
  intervalDays?: number | null
  skipHolidays: boolean
  title: string
  status?: SomaStatus
  period?: "AM" | "PM" | "AM_PM" | "NOCHE"
  startTime?: string | null
  durationMinutes?: number | null
  location?: string | null
  notes?: string | null
}

export type WeeklyRecurrenceOverride = {
  date: string
  title: string
  status?: SomaStatus | null
  period?: CalendarRecurringRule["period"] | null
  startTime?: string | null
  durationMinutes?: number | null
  location?: string | null
  notes?: string | null
}

function parseDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return date.toISOString().slice(0, 10) === dateKey ? date : null
}

export function expandCalendarRecurrence(
  rule: CalendarRecurringRule,
  from: string,
  through: string,
  overrides: readonly WeeklyRecurrenceOverride[] = [],
): CalendarEntry[] {
  const startDate = parseDateKey(rule.startDate)
  const rangeStart = parseDateKey(from)
  const rangeEnd = parseDateKey(through)
  const endDate = rule.endDate ? parseDateKey(rule.endDate) : null
  const frequency = rule.frequency ?? "WEEKLY"
  const weekdays = rule.weekdays?.length ? rule.weekdays : rule.weekday === undefined ? [] : [rule.weekday]
  const validWeekly =
    frequency !== "WEEKLY" ||
    (weekdays.length > 0 && weekdays.every((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))
  const validMonthly =
    frequency !== "MONTHLY" ||
    (rule.lastDayOfMonth
      ? rule.dayOfMonth == null
      : Number.isInteger(rule.dayOfMonth) && rule.dayOfMonth! >= 1 && rule.dayOfMonth! <= 31)
  const validInterval = frequency !== "INTERVAL" || (Number.isInteger(rule.intervalDays) && rule.intervalDays! >= 1)
  if (
    !startDate ||
    !rangeStart ||
    !rangeEnd ||
    (rule.endDate && !endDate) ||
    !validWeekly ||
    !validMonthly ||
    !validInterval ||
    through < from
  ) {
    return []
  }

  const cursor = new Date(Math.max(startDate.getTime(), rangeStart.getTime()))
  const lastDate = endDate && endDate < rangeEnd ? endDate : rangeEnd
  const entries: CalendarEntry[] = []
  const overridesByDate = new Map(overrides.map((override) => [override.date, override]))
  const intervalStart = startDate.getTime()

  while (cursor <= lastDate) {
    const date = cursor.toISOString().slice(0, 10)
    const override = overridesByDate.get(date)
    const isScheduledDate =
      frequency === "WEEKLY"
        ? weekdays.includes(cursor.getUTCDay())
        : frequency === "MONTHLY"
          ? cursor.getUTCDate() ===
            (rule.lastDayOfMonth
              ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
              : Math.min(
                  rule.dayOfMonth!,
                  new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate(),
                ))
          : Math.round((cursor.getTime() - intervalStart) / 86_400_000) % rule.intervalDays! === 0
    if (isScheduledDate && (override || !(rule.skipHolidays && getColombianHoliday(date)))) {
      const title = override?.title ?? rule.title
      const status = override?.status ?? rule.status
      const recurrencePeriod = override?.period ?? rule.period
      const startTime = override ? override.startTime : rule.startTime
      const durationMinutes = override ? override.durationMinutes : rule.durationMinutes
      const location = override ? override.location : rule.location
      const notes = override ? override.notes : rule.notes
      const periods: (NonNullable<CalendarEntry["period"]> | undefined)[] =
        rule.kind !== "SOMA" ? [undefined] : recurrencePeriod === "AM_PM" ? ["AM", "PM"] : [recurrencePeriod ?? "AM"]
      for (const period of periods) {
        entries.push({
          id: `recurrence-${rule.id}-${date}${period ? `-${period}` : ""}`,
          recurrenceId: rule.id,
          recurrenceStartDate: rule.startDate,
          recurrenceEndDate: rule.endDate,
          recurrenceFrequency: frequency,
          recurrenceWeekday: weekdays[0],
          recurrenceWeekdays: frequency === "WEEKLY" ? weekdays : undefined,
          recurrenceDayOfMonth: frequency === "MONTHLY" ? (rule.dayOfMonth ?? undefined) : undefined,
          recurrenceLastDayOfMonth: frequency === "MONTHLY" ? Boolean(rule.lastDayOfMonth) : undefined,
          recurrenceIntervalDays: frequency === "INTERVAL" ? (rule.intervalDays ?? undefined) : undefined,
          recurrencePeriod,
          skipHolidays: rule.skipHolidays,
          date,
          kind: rule.kind,
          ...(rule.kind === "SOMA" ? { status, period, manualOverride: true } : {}),
          title,
          ...(startTime ? { startTime } : {}),
          ...(durationMinutes ? { durationHours: durationMinutes / 60 } : {}),
          ...(location ? { location } : {}),
          ...(notes ? { notes } : {}),
        })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return entries
}

export const expandWeeklyRecurrence = expandCalendarRecurrence
