import type { CalendarEntry, ShiftPeriod } from "./types"

export type AvailabilityState = "LIBRE" | "RESERVA" | "OCUPADO" | "EVENTO" | "VACACIONES"

export type ShiftWindow = {
  startTime: string
  durationMinutes: number
}

export type ShiftWindows = Partial<Record<Exclude<ShiftPeriod, "AM + PM">, ShiftWindow>>

export const somaShiftWindows: ShiftWindows = {
  AM: { startTime: "07:00", durationMinutes: 360 },
  PM: { startTime: "13:00", durationMinutes: 360 },
  NOCHE: { startTime: "19:00", durationMinutes: 720 },
}

export type ScheduleConflict = {
  date: string
  firstEntryId: string
  secondEntryId: string
  type: "HORARIO" | "VACACIONES"
}

const occupiedSomaStatuses = new Set(["TURNO", "NOCHE", "TURNO_DE_OTRA_PERSONA", "EXTERNO", "EXTERNO_NOCHE"])

function includesDate(entry: CalendarEntry, date: string) {
  const endDate = entry.endDate ?? (entry.kind === "VACACIONES" ? "9999-12-31" : entry.date)
  return entry.date <= date && endDate >= date
}

function isNightCarryover(entry: CalendarEntry, date: string) {
  if (entry.kind !== "SOMA" || entry.period !== "NOCHE" || !entry.status || !occupiedSomaStatuses.has(entry.status)) {
    return false
  }
  const nextDay = new Date(`${entry.date}T00:00:00.000Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return nextDay.toISOString().slice(0, 10) === date
}

export function getDayAvailability(entries: CalendarEntry[], date: string): AvailabilityState {
  const dayEntries = entries.filter((entry) => includesDate(entry, date))
  if (dayEntries.some((entry) => entry.kind === "VACACIONES")) return "VACACIONES"
  if (dayEntries.some((entry) => entry.kind === "SOMA" && entry.status && occupiedSomaStatuses.has(entry.status)))
    return "OCUPADO"
  if (entries.some((entry) => isNightCarryover(entry, date))) return "OCUPADO"
  if (dayEntries.some((entry) => entry.kind === "SOMA" && entry.status?.startsWith("R"))) return "RESERVA"
  if (dayEntries.some((entry) => entry.kind === "SEDARTE" || entry.kind === "PERSONAL")) return "EVENTO"
  if (
    dayEntries.some(
      (entry) => entry.kind === "SOMA" && (entry.status === "LIBRE" || entry.status === "TURNO_OTRA_PERSONA"),
    )
  ) {
    return "LIBRE"
  }
  return "LIBRE"
}

function parseTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function toAbsoluteMinutes(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`) / 60000
}

function getAbsoluteIntervals(entry: CalendarEntry, windows: ShiftWindows) {
  const dayStart = toAbsoluteMinutes(entry.date)
  if (entry.kind === "VACACIONES") return []
  if (entry.kind === "SOMA") {
    if (entry.status === "LIBRE" || entry.status === "TURNO_OTRA_PERSONA" || !entry.period) return []
    const periods = entry.period === "AM + PM" ? (["AM", "PM"] as const) : [entry.period]
    return periods.flatMap((period) => {
      const window = windows[period]
      if (!window || window.durationMinutes <= 0) return []
      const start = dayStart + parseTime(window.startTime)
      return [{ start, end: start + window.durationMinutes }]
    })
  }

  if (!entry.startTime || !entry.durationHours) return [{ start: dayStart, end: dayStart + 1440 }]
  const start = dayStart + parseTime(entry.startTime)
  return [{ start, end: start + Math.round(entry.durationHours * 60) }]
}

function getIntervalsOnDate(entry: CalendarEntry, date: string, windows: ShiftWindows) {
  if (entry.kind === "VACACIONES") {
    return includesDate(entry, date) ? [{ start: 0, end: 1440 }] : []
  }

  const dayStart = toAbsoluteMinutes(date)
  const dayEnd = dayStart + 1440
  return getAbsoluteIntervals(entry, windows).flatMap((interval) => {
    const start = Math.max(interval.start, dayStart)
    const end = Math.min(interval.end, dayEnd)
    return start < end ? [{ start: start - dayStart, end: end - dayStart }] : []
  })
}

function isFullDayEvent(entry: CalendarEntry) {
  return entry.kind !== "SOMA" && entry.kind !== "VACACIONES" && (!entry.startTime || !entry.durationHours)
}

function isWorkedSomaShift(entry: CalendarEntry) {
  return entry.kind === "SOMA" && Boolean(entry.status && occupiedSomaStatuses.has(entry.status))
}

function dateRange(start: string, end: string) {
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00.000Z`)
  const last = new Date(`${end}T12:00:00.000Z`)
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function findScheduleConflicts(entries: CalendarEntry[], windows: ShiftWindows = {}) {
  const result: ScheduleConflict[] = []
  const firstDate = entries.reduce<string | null>(
    (earliest, entry) => (earliest === null || entry.date < earliest ? entry.date : earliest),
    null,
  )
  const lastEntryDate = entries.reduce<string | null>((latest, entry) => {
    const endDate = entry.endDate ?? entry.date
    return latest === null || endDate > latest ? endDate : latest
  }, null)
  if (!firstDate || !lastEntryDate) return result

  const lastDay = entries.reduce(
    (latest, entry) => {
      const lastIntervalMinute = getAbsoluteIntervals(entry, windows).reduce(
        (end, interval) => Math.max(end, interval.end),
        toAbsoluteMinutes(entry.endDate ?? entry.date) + 1440,
      )
      return Math.max(latest, Math.ceil(lastIntervalMinute / 1440) - 1)
    },
    Math.floor(toAbsoluteMinutes(lastEntryDate) / 1440),
  )
  const lastDate = new Date(lastDay * 86400000).toISOString().slice(0, 10)

  for (const date of dateRange(firstDate, lastDate)) {
    const active = entries.filter(
      (entry) => includesDate(entry, date) || getIntervalsOnDate(entry, date, windows).length > 0,
    )
    for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
        const left = active[leftIndex]
        const right = active[rightIndex]
        if (left.kind === "SOMA" && left.status === "LIBRE") continue
        if (right.kind === "SOMA" && right.status === "LIBRE") continue

        const hasVacation = left.kind === "VACACIONES" || right.kind === "VACACIONES"
        const fullDayWorkOverlap =
          (isFullDayEvent(left) && isWorkedSomaShift(right)) || (isFullDayEvent(right) && isWorkedSomaShift(left))
        const intervalsOverlap = getIntervalsOnDate(left, date, windows).some((leftInterval) =>
          getIntervalsOnDate(right, date, windows).some(
            (rightInterval) => leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end,
          ),
        )

        if (hasVacation || fullDayWorkOverlap || intervalsOverlap) {
          result.push({
            date,
            firstEntryId: left.id,
            secondEntryId: right.id,
            type: hasVacation ? "VACACIONES" : "HORARIO",
          })
        }
      }
    }
  }

  return result
}
