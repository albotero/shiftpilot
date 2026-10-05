import type { CalendarEntry, ShiftPeriod } from "./types"

export type AvailabilityState = "SIN_REGISTRO" | "LIBRE" | "RESERVA" | "OCUPADO" | "EVENTO" | "VACACIONES"

export type ShiftWindow = {
  startTime: string
  durationMinutes: number
}

export type ShiftWindows = Partial<Record<Exclude<ShiftPeriod, "AM + PM">, ShiftWindow>>

export type ScheduleConflict = {
  date: string
  firstEntryId: string
  secondEntryId: string
  type: "HORARIO" | "VACACIONES"
}

function includesDate(entry: CalendarEntry, date: string) {
  return entry.date <= date && (entry.endDate ?? entry.date) >= date
}

export function getDayAvailability(entries: CalendarEntry[], date: string): AvailabilityState {
  const dayEntries = entries.filter((entry) => includesDate(entry, date))
  if (dayEntries.some((entry) => entry.kind === "VACACIONES")) return "VACACIONES"
  if (dayEntries.some((entry) => entry.kind === "SOMA" && entry.status === "TURNO")) return "OCUPADO"
  if (dayEntries.some((entry) => entry.kind === "SOMA" && entry.status?.startsWith("R"))) return "RESERVA"
  if (dayEntries.some((entry) => entry.kind === "SEDARTE" || entry.kind === "PERSONAL")) return "EVENTO"
  if (dayEntries.some((entry) => entry.kind === "SOMA" && entry.status === "LIBRE")) return "LIBRE"
  return "SIN_REGISTRO"
}

function parseTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function getIntervals(entry: CalendarEntry, windows: ShiftWindows) {
  if (entry.kind === "VACACIONES") return [{ start: 0, end: 1440 }]

  if (entry.kind === "SOMA") {
    if (entry.status === "LIBRE" || !entry.period) return []
    const periods = entry.period === "AM + PM" ? (["AM", "PM"] as const) : [entry.period]
    return periods.flatMap((period) => {
      const window = windows[period]
      if (!window || window.durationMinutes <= 0) return []
      const start = parseTime(window.startTime)
      return [{ start, end: Math.min(start + window.durationMinutes, 1440) }]
    })
  }

  if (!entry.startTime || !entry.durationHours) return [{ start: 0, end: 1440 }]
  const start = parseTime(entry.startTime)
  return [{ start, end: Math.min(start + Math.round(entry.durationHours * 60), 1440) }]
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
  const lastDate = entries.reduce<string | null>((latest, entry) => {
    const endDate = entry.endDate ?? entry.date
    return latest === null || endDate > latest ? endDate : latest
  }, null)
  if (!firstDate || !lastDate) return result

  for (const date of dateRange(firstDate, lastDate)) {
    const active = entries.filter((entry) => includesDate(entry, date))
    for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
        const left = active[leftIndex]
        const right = active[rightIndex]
        if (left.kind === "SOMA" && left.status === "LIBRE") continue
        if (right.kind === "SOMA" && right.status === "LIBRE") continue

        const hasVacation = left.kind === "VACACIONES" || right.kind === "VACACIONES"
        const intervalsOverlap = getIntervals(left, windows).some((leftInterval) =>
          getIntervals(right, windows).some(
            (rightInterval) => leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end,
          ),
        )

        if (hasVacation || intervalsOverlap) {
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
