export type CalendarView = "month" | "week" | "agenda";

export type CalendarEntryKind = "SOMA" | "SEDARTE" | "PERSONAL" | "VACACIONES";

export type SomaStatus =
  | "LIBRE"
  | "R4"
  | "R3"
  | "R2"
  | "R1"
  | "TURNO";

export type ShiftPeriod = "AM" | "PM" | "AM + PM";

export type CalendarEntry = {
  id: string;
  date: string;
  endDate?: string;
  kind: CalendarEntryKind;
  status?: SomaStatus;
  period?: ShiftPeriod;
  title: string;
  startTime?: string;
  durationHours?: number;
  location?: string;
  notes?: string;
};

export type EntryFilters = Record<CalendarEntryKind, boolean>;