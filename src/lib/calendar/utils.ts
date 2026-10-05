import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import type { CalendarEntry, CalendarEntryKind, CalendarView, ShiftPeriod } from "./types";

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function getVisibleDays(date: Date, view: CalendarView) {
  if (view === "week") {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }

  const firstOfMonth = startOfMonth(date);
  return eachDayOfInterval({
    start: startOfWeek(firstOfMonth, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
  });
}

export function getEntriesForDate(entries: CalendarEntry[], date: Date) {
  const key = toDateKey(date);
  return entries.filter((entry) => entry.date <= key && (entry.endDate ?? entry.date) >= key);
}

export function getEntryLabel(entry: CalendarEntry) {
  if (entry.kind === "VACACIONES") return "VACACIONES";
  if (entry.kind === "SOMA") {
    return entry.status === "TURNO" ? `TURNO${entry.period ? ` ${entry.period}` : ""}` : entry.status ?? "Soma";
  }
  return entry.title || (entry.kind === "SEDARTE" ? "Sedarte" : "Personal");
}

export function getEntryTone(entry: CalendarEntry) {
  if (entry.kind === "VACACIONES") return "vacation";
  if (entry.kind === "SEDARTE") return "sedarte";
  if (entry.kind === "PERSONAL") return "personal";
  if (entry.status === "TURNO") return "shift";
  if (entry.status === "LIBRE") return "free";
  return "reservation";
}

export function getEntryKindLabel(kind: CalendarEntryKind) {
  return {
    SOMA: "Soma",
    SEDARTE: "Sedarte",
    PERSONAL: "Personal",
    VACACIONES: "Vacaciones",
  }[kind];
}

export function getMonthShiftHours(entries: CalendarEntry[], date: Date) {
  return entries.reduce((total, entry) => {
    if (
      entry.kind !== "SOMA" ||
      entry.status !== "TURNO" ||
      !entry.period ||
      !isSameMonth(new Date(`${entry.date}T12:00:00`), date)
    ) {
      return total;
    }

    return total + (entry.period === "AM + PM" ? 12 : 6);
  }, 0);
}

export function formatMonth(date: Date) {
  return format(date, "MMMM yyyy", { locale: es });
}

export function formatLongDate(date: Date) {
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

export function formatShiftPeriod(period: ShiftPeriod) {
  return period === "AM + PM" ? "AM + PM · 12 h" : `${period} · 6 h`;
}