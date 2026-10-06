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
export type CalendarReminderMode = "MINUTES_BEFORE" | "DAY_AT_5_AM"

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
  replacementPersonId?: string
  amReplacementPersonId?: string
  pmReplacementPersonId?: string
  anesthesiologist?: string
  title: string
  startTime?: string
  durationHours?: number
  location?: string
  notes?: string
  recurrenceId?: string
  repeatWeekly?: boolean
  recurrenceStartDate?: string
  recurrenceEndDate?: string | null
  recurrenceWeekday?: number
  recurrenceFrequency?: "WEEKLY" | "MONTHLY" | "INTERVAL"
  recurrenceWeekdays?: number[]
  recurrenceDayOfMonth?: number
  recurrenceLastDayOfMonth?: boolean
  recurrenceIntervalDays?: number
  recurrencePeriod?: "AM" | "PM" | "AM_PM" | "NOCHE"
  skipHolidays?: boolean
  recurrenceEditScope?: "OCCURRENCE" | "THIS_AND_FUTURE"
  recurrenceDeleteScope?: "ALL" | "FUTURE"
  reminderEnabled?: boolean
  reminderMode?: CalendarReminderMode
  reminderMinutesBefore?: number
}

export type EntryFilters = Record<CalendarEntryKind, boolean>
