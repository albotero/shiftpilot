export type CalendarView = "month" | "week" | "agenda"

export type CalendarEntryKind = "SOMA" | "SEDARTE" | "PERSONAL" | "VACACIONES"

export type SomaStatus =
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

export type ShiftPeriod = "AM" | "PM" | "AM + PM" | "NOCHE"

export type CalendarEntry = {
  id: string
  date: string
  endDate?: string
  kind: CalendarEntryKind
  status?: SomaStatus
  period?: ShiftPeriod
  isFallback?: boolean
  manualOverride?: boolean
  annualPlanYear?: number
  anesthesiologist?: string
  title: string
  startTime?: string
  durationHours?: number
  location?: string
  notes?: string
}

export type EntryFilters = Record<CalendarEntryKind, boolean>
