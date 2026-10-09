import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { es } from "date-fns/locale"
import { somaShiftWindows } from "./availability"
import type { CalendarEntry, CalendarEntryKind, CalendarView, ShiftPeriod } from "./types"

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd")
}

export function getVisibleDays(date: Date, view: CalendarView) {
  if (view === "week") {
    const start = startOfWeek(date, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: addDays(start, 6) })
  }

  const firstOfMonth = startOfMonth(date)
  return eachDayOfInterval({
    start: startOfWeek(firstOfMonth, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
  })
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function getCalendarEntryStartMinute(entry: CalendarEntry) {
  if (entry.kind === "SOMA" && entry.period) {
    const period = entry.period === "AM + PM" ? "AM" : entry.period
    const startTime = somaShiftWindows[period]?.startTime
    if (startTime) return timeToMinutes(startTime)
  }
  return entry.startTime ? timeToMinutes(entry.startTime) : 0
}

export function compareCalendarEntriesByStart(left: CalendarEntry, right: CalendarEntry) {
  return left.date.localeCompare(right.date) || getCalendarEntryStartMinute(left) - getCalendarEntryStartMinute(right)
}

export function isUpcomingCalendarEntry(entry: CalendarEntry, today: string, currentMinute: number) {
  if (entry.date > today) return true
  if (entry.date < today) return false

  const hasStartTime = entry.kind === "SOMA" ? Boolean(entry.period || entry.startTime) : Boolean(entry.startTime)
  return !hasStartTime || getCalendarEntryStartMinute(entry) > currentMinute
}

export function getEntriesForDate(entries: CalendarEntry[], date: Date, includeFreeSomaFallback = true) {
  const key = toDateKey(date)
  const matching = entries.filter((entry) => {
    const endDate = entry.endDate ?? (entry.kind === "VACACIONES" ? "9999-12-31" : entry.date)
    return entry.date <= key && endDate >= key
  })
  const scheduled = matching.filter((entry) => !(entry.kind === "SOMA" && entry.status === "LIBRE"))
  if (!includeFreeSomaFallback) {
    return scheduled.sort((left, right) => getCalendarEntryStartMinute(left) - getCalendarEntryStartMinute(right))
  }

  const occupiedPeriods = new Set<"AM" | "PM">()
  for (const entry of scheduled) {
    if (entry.kind === "SOMA") {
      if (entry.period === "AM + PM") {
        occupiedPeriods.add("AM")
        occupiedPeriods.add("PM")
      } else if (entry.period === "AM" || entry.period === "PM") {
        occupiedPeriods.add(entry.period)
      }
      continue
    }

    if (entry.kind === "VACACIONES" || !entry.startTime || !entry.durationHours) {
      occupiedPeriods.add("AM")
      occupiedPeriods.add("PM")
      continue
    }

    const [hours, minutes] = entry.startTime.split(":").map(Number)
    const startMinutes = hours * 60 + minutes
    const endMinutes = Math.min(startMinutes + Math.round(entry.durationHours * 60), 1440)
    if (startMinutes < 12 * 60 && endMinutes > 0) occupiedPeriods.add("AM")
    if (startMinutes < 1440 && endMinutes > 12 * 60) occupiedPeriods.add("PM")
  }

  const freePeriods = (["AM", "PM"] as const).filter((period) => !occupiedPeriods.has(period))
  const fallbackEntries: CalendarEntry[] = freePeriods.map((period) => ({
    id: `fallback-${key}-${period}`,
    date: key,
    kind: "SOMA",
    status: "LIBRE",
    period,
    title: "LIBRE",
    isFallback: true,
  }))
  return [...scheduled, ...fallbackEntries].sort(
    (left, right) => getCalendarEntryStartMinute(left) - getCalendarEntryStartMinute(right),
  )
}

export function getEntryLabel(entry: CalendarEntry) {
  if (entry.kind === "VACACIONES") return "VACACIONES"
  if (entry.kind === "SOMA") {
    if (entry.status === "NOCHE") return "NOCHE"
    if (entry.status === "TURNO_OTRA_PERSONA" || entry.status === "TURNO_DE_OTRA_PERSONA") {
      return [entry.anesthesiologist?.trim(), entry.period === "NOCHE" ? "NOCHE" : entry.period]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    }
    const labels: Partial<Record<NonNullable<CalendarEntry["status"]>, string>> = {
      TURNO: "TURNO",
      NOCHE: "NOCHE",
      R5: "Adicional",
      TURNO_OTRA_PERSONA: "Cubierto por otra persona",
      TURNO_DE_OTRA_PERSONA: "Turno de otra persona",
      EXTERNO: "Externo",
      EXTERNO_NOCHE: "Externo noche",
    }
    const label = entry.status ? (labels[entry.status] ?? entry.status) : "Soma"
    return `${label}${entry.period ? ` ${entry.period}` : ""}`
  }
  return entry.title || (entry.kind === "SEDARTE" ? "Sedarte" : "Personal")
}

export function getEntryTone(entry: CalendarEntry) {
  if (entry.kind === "VACACIONES") return "vacation"
  if (entry.kind === "SEDARTE") return "sedarte"
  if (entry.kind === "PERSONAL") return "personal"
  if (entry.status === "TURNO" || entry.status === "NOCHE") return "shift"
  if (entry.status === "TURNO_OTRA_PERSONA") return "other-shift"
  if (entry.status === "TURNO_DE_OTRA_PERSONA") return "borrowed-shift"
  if (entry.status === "EXTERNO") return "external"
  if (entry.status === "EXTERNO_NOCHE") return "external-night"
  if (entry.status === "LIBRE") return "free"
  if (entry.status === "R1") return "reservation-r1"
  if (entry.status === "R2") return "reservation-r2"
  if (entry.status === "R3") return "reservation-r3"
  if (entry.status === "R4") return "reservation-r4"
  if (entry.status === "R5") return "reservation-r5"
  return "reservation"
}

export function isSomaWorkStatus(status: CalendarEntry["status"]) {
  return (
    status === "TURNO" ||
    status === "NOCHE" ||
    status === "R1" ||
    status === "R2" ||
    status === "R3" ||
    status === "R4" ||
    status === "R5" ||
    status === "TURNO_DE_OTRA_PERSONA" ||
    status === "EXTERNO" ||
    status === "EXTERNO_NOCHE"
  )
}

export function getMonthSomaShiftCount(entries: CalendarEntry[], date: Date) {
  return entries.reduce((total, entry) => {
    if (
      entry.kind === "SOMA" &&
      entry.status !== undefined &&
      entry.status !== "LIBRE" &&
      entry.status !== "TURNO_OTRA_PERSONA" &&
      isSameMonth(new Date(`${entry.date}T12:00:00`), date)
    ) {
      return total + (entry.period === "NOCHE" || entry.period === "AM + PM" ? 2 : 1)
    }
    return total
  }, 0)
}

export function getEntryKindLabel(kind: CalendarEntryKind) {
  return {
    SOMA: "Soma",
    SEDARTE: "Sedarte",
    PERSONAL: "Personal",
    VACACIONES: "Vacaciones",
  }[kind]
}

export function getMonthShiftHours(entries: CalendarEntry[], date: Date) {
  return entries.reduce((total, entry) => {
    if (
      entry.kind !== "SOMA" ||
      !isSomaWorkStatus(entry.status) ||
      !entry.period ||
      !isSameMonth(new Date(`${entry.date}T12:00:00`), date)
    ) {
      return total
    }

    return total + (entry.period === "AM + PM" || entry.period === "NOCHE" ? 12 : 6)
  }, 0)
}

export function formatMonth(date: Date) {
  return format(date, "MMMM yyyy", { locale: es })
}

export function formatLongDate(date: Date) {
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}

export function formatShiftPeriod(period: ShiftPeriod) {
  return period === "AM + PM" || period === "NOCHE" ? `${period} · 12 h` : `${period} · 6 h`
}
