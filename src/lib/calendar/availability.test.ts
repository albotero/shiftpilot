import { describe, expect, it } from "vitest"
import { findScheduleConflicts, getDayAvailability, somaShiftWindows } from "@/lib/calendar/availability"
import {
  getCalendarEntryStartMinute,
  getEntryLabel,
  getEntryTone,
  getEntriesForDate,
  getMonthShiftHours,
  getMonthSomaShiftCount,
  isSomaWorkStatus,
} from "@/lib/calendar/utils"
import { getCoveredShiftSummary } from "@/lib/calendar/coverage-compensation"
import type { CalendarEntry } from "@/lib/calendar/types"

const reservedShift: CalendarEntry = {
  id: "r4-am",
  date: "2026-10-05",
  kind: "SOMA",
  status: "R4",
  period: "AM",
  title: "R4",
}

describe("calendar availability", () => {
  it("orders month and week day entries by actual start time", () => {
    const additionalAm: CalendarEntry = { ...reservedShift, status: "R5", period: "AM" }
    const sedarte: CalendarEntry = {
      id: "early-sedarte",
      date: reservedShift.date,
      kind: "SEDARTE",
      title: "Sedarte 06:30",
      startTime: "06:30",
      durationHours: 1,
    }
    const personal: CalendarEntry = {
      id: "midday-personal",
      date: reservedShift.date,
      kind: "PERSONAL",
      title: "Cita 12:30",
      startTime: "12:30",
      durationHours: 1,
    }
    const reservedPm: CalendarEntry = { ...reservedShift, id: "r3-pm", status: "R3", period: "PM" }
    const sorted = getEntriesForDate([reservedPm, additionalAm, personal, sedarte], new Date("2026-10-05T12:00:00"))

    expect(sorted.map(getEntryLabel)).toEqual(["Sedarte 06:30", "Adicional AM", "Cita 12:30", "R3 PM"])
    expect(getCalendarEntryStartMinute(additionalAm)).toBe(420)
    expect(getCalendarEntryStartMinute(reservedPm)).toBe(780)
  })

  it("treats R1-R5 turn names as occupied shifts", () => {
    const statuses = ["R1", "R2", "R3", "R4", "R5"] as const

    expect(statuses.map((status) => getDayAvailability([{ ...reservedShift, status }], "2026-10-05"))).toEqual(
      statuses.map(() => "OCUPADO"),
    )
    expect(getDayAvailability([], "2026-10-05")).toBe("LIBRE")
  })

  it("preserves progressive R1-R5 tones while treating them as occupied work", () => {
    const statuses = ["R1", "R2", "R3", "R4", "R5"] as const

    expect(statuses.map((status) => getEntryTone({ ...reservedShift, status }))).toEqual([
      "reservation-r1",
      "reservation-r2",
      "reservation-r3",
      "reservation-r4",
      "reservation-r5",
    ])
    expect(statuses.map((status) => getDayAvailability([{ ...reservedShift, status }], "2026-10-05"))).toEqual(
      statuses.map(() => "OCUPADO"),
    )
  })

  it("marks an in-person Soma shift as occupied", () => {
    expect(getDayAvailability([{ ...reservedShift, status: "TURNO" }], "2026-10-05")).toBe("OCUPADO")
  })

  it("treats external Soma shifts as work that blocks availability", () => {
    const workStatuses = ["EXTERNO", "EXTERNO_NOCHE"] as const
    for (const status of workStatuses) {
      const entry = { ...reservedShift, status }
      expect(getDayAvailability([entry], "2026-10-05")).toBe("OCUPADO")
      expect(isSomaWorkStatus(status)).toBe(true)
      expect(getEntryTone(entry)).not.toBe("reservation")
      expect(getEntryLabel(entry)).not.toBe(status)
    }
  })

  it("does not count or block availability for a turn covered by someone else", () => {
    const coveredShift: CalendarEntry = {
      ...reservedShift,
      id: "covered-r5",
      status: "TURNO_OTRA_PERSONA",
      period: "PM",
      anesthesiologist: "Verónica",
      notes: "Cambio de agenda",
    }
    const ownTurn: CalendarEntry = { ...reservedShift, id: "own-turn", status: "TURNO", period: "AM" }

    expect(getDayAvailability([coveredShift], "2026-10-05")).toBe("LIBRE")
    expect(isSomaWorkStatus(coveredShift.status)).toBe(false)
    expect(getEntryLabel(coveredShift)).toBe("Verónica PM")
    expect(getEntryLabel({ ...coveredShift, anesthesiologist: " " })).toBe("PM")
    expect(getEntryTone(coveredShift)).toBe("other-shift")
    expect(getMonthSomaShiftCount([reservedShift, coveredShift, ownTurn], new Date("2026-10-01T12:00:00"))).toBe(2)
    expect(getMonthShiftHours([reservedShift, coveredShift, ownTurn], new Date("2026-10-01T12:00:00"))).toBe(12)
  })

  it("counts a shift worked for another person as work and occupied time", () => {
    const borrowedShift: CalendarEntry = {
      ...reservedShift,
      id: "borrowed-shift",
      status: "TURNO_DE_OTRA_PERSONA",
      period: "AM + PM",
      anesthesiologist: "Verónica",
      notes: "Cambio de agenda",
    }

    expect(getDayAvailability([borrowedShift], "2026-10-05")).toBe("OCUPADO")
    expect(isSomaWorkStatus(borrowedShift.status)).toBe(true)
    expect(getEntryLabel(borrowedShift)).toBe("Verónica AM + PM")
    expect(getEntryTone(borrowedShift)).toBe("borrowed-shift")
    expect(getMonthSomaShiftCount([borrowedShift], new Date("2026-10-01T12:00:00"))).toBe(2)
    expect(getMonthShiftHours([borrowedShift], new Date("2026-10-01T12:00:00"))).toBe(12)
  })

  it("counts a NOCHE shift as 12 hours with the same tone as TURNO", () => {
    const nightShift: CalendarEntry = {
      ...reservedShift,
      id: "night-shift",
      status: "NOCHE",
      period: "NOCHE",
      durationHours: 12,
    }
    const dayEntries = getEntriesForDate([nightShift], new Date("2026-10-05T12:00:00"))

    expect(getEntryLabel(nightShift)).toBe("NOCHE")
    expect(getEntryTone(nightShift)).toBe(getEntryTone({ ...nightShift, status: "TURNO", period: "AM" }))
    expect(getDayAvailability([nightShift], "2026-10-05")).toBe("OCUPADO")
    expect(getDayAvailability([nightShift], "2026-10-06")).toBe("OCUPADO")
    expect(dayEntries.some((entry) => entry.isFallback && entry.period === "AM")).toBe(true)
    expect(dayEntries.some((entry) => entry.isFallback && entry.period === "PM")).toBe(true)
    expect(getMonthSomaShiftCount([nightShift], new Date("2026-10-01T12:00:00"))).toBe(2)
    expect(getMonthShiftHours([nightShift], new Date("2026-10-01T12:00:00"))).toBe(12)
  })

  it("supports covering or working another person's NOCHE", () => {
    const nightCoverage: CalendarEntry = {
      ...reservedShift,
      id: "night-coverage",
      status: "TURNO_OTRA_PERSONA",
      period: "NOCHE",
      anesthesiologist: "Patricia",
    }
    const nightWorked: CalendarEntry = {
      ...nightCoverage,
      id: "night-worked",
      status: "TURNO_DE_OTRA_PERSONA",
    }

    expect(getEntryLabel(nightCoverage)).toBe("Patricia NOCHE")
    expect(isSomaWorkStatus(nightWorked.status)).toBe(true)
    expect(getMonthShiftHours([nightWorked], new Date("2026-10-01T12:00:00"))).toBe(12)
  })

  it("detects a timed event overlapping a shift when its window is configured", () => {
    const appointment: CalendarEntry = {
      id: "appointment",
      date: "2026-10-05",
      kind: "PERSONAL",
      title: "Cita médica",
      startTime: "12:00",
      durationHours: 2,
    }
    const conflicts = findScheduleConflicts([{ ...reservedShift, status: "TURNO" }, appointment], {
      AM: { startTime: "07:00", durationMinutes: 360 },
    })

    expect(conflicts).toMatchObject([{ date: "2026-10-05", type: "HORARIO" }])
  })

  it("detects an Adicional AM shift overlapping a timed personal event", () => {
    const additionalAm: CalendarEntry = { ...reservedShift, date: "2026-10-17", status: "R5", period: "AM" }
    const personal: CalendarEntry = {
      id: "personal-recurring",
      date: "2026-10-17",
      kind: "PERSONAL",
      title: "Evento personal",
      startTime: "09:00",
      durationHours: 2,
    }

    expect(findScheduleConflicts([additionalAm, personal], somaShiftWindows)).toMatchObject([
      {
        date: "2026-10-17",
        firstEntryId: additionalAm.id,
        secondEntryId: personal.id,
        type: "HORARIO",
      },
    ])
  })

  it("detects overlapping timed Sedarte and personal events", () => {
    const sedarte: CalendarEntry = {
      id: "sedarte-event",
      date: "2026-10-05",
      kind: "SEDARTE",
      title: "Procedimiento",
      startTime: "09:30",
      durationHours: 2,
    }
    const personal: CalendarEntry = {
      id: "personal-event",
      date: "2026-10-05",
      kind: "PERSONAL",
      title: "Cita",
      startTime: "11:00",
      durationHours: 1,
    }

    expect(findScheduleConflicts([sedarte, personal])).toMatchObject([
      { date: "2026-10-05", firstEntryId: sedarte.id, secondEntryId: personal.id, type: "HORARIO" },
    ])
  })

  it("detects a full-day personal event against a worked Soma shift without assumed shift hours", () => {
    const allDayEvent: CalendarEntry = {
      id: "personal-all-day",
      date: "2026-10-05",
      kind: "PERSONAL",
      title: "Día personal",
    }
    const workedShift: CalendarEntry = { ...reservedShift, status: "TURNO" }
    const coveredBySomeoneElse: CalendarEntry = { ...reservedShift, status: "TURNO_OTRA_PERSONA" }

    expect(findScheduleConflicts([allDayEvent, workedShift])).toMatchObject([
      { date: "2026-10-05", firstEntryId: allDayEvent.id, secondEntryId: workedShift.id, type: "HORARIO" },
    ])
    expect(findScheduleConflicts([allDayEvent, reservedShift])).toMatchObject([
      { date: "2026-10-05", firstEntryId: allDayEvent.id, secondEntryId: reservedShift.id, type: "HORARIO" },
    ])
    expect(findScheduleConflicts([allDayEvent, coveredBySomeoneElse])).toEqual([])
  })

  it("uses Soma AM and PM boundaries and carries NOCHE conflicts into the next day", () => {
    const amShift: CalendarEntry = { ...reservedShift, status: "TURNO", period: "AM" }
    const pmShift: CalendarEntry = { ...reservedShift, id: "pm-shift", status: "TURNO", period: "PM" }
    const nightShift: CalendarEntry = {
      ...reservedShift,
      id: "night-shift",
      date: "2026-10-05",
      status: "NOCHE",
      period: "NOCHE",
    }
    const eventAtPmStart: CalendarEntry = {
      id: "pm-start-event",
      date: "2026-10-05",
      kind: "SEDARTE",
      title: "Inicio PM",
      startTime: "13:00",
      durationHours: 0.5,
    }
    const eventAtPmEnd: CalendarEntry = {
      ...eventAtPmStart,
      id: "pm-end-event",
      startTime: "19:00",
    }
    const overnightEvent: CalendarEntry = {
      ...eventAtPmStart,
      id: "overnight-event",
      date: "2026-10-06",
      startTime: "06:30",
      durationHours: 1,
    }

    expect(somaShiftWindows).toEqual({
      AM: { startTime: "07:00", durationMinutes: 360 },
      PM: { startTime: "13:00", durationMinutes: 360 },
      NOCHE: { startTime: "19:00", durationMinutes: 720 },
    })
    expect(findScheduleConflicts([amShift, eventAtPmStart], somaShiftWindows)).toEqual([])
    expect(findScheduleConflicts([pmShift, eventAtPmStart], somaShiftWindows)).toMatchObject([
      { date: "2026-10-05", type: "HORARIO" },
    ])
    expect(findScheduleConflicts([pmShift, eventAtPmEnd], somaShiftWindows)).toEqual([])
    expect(findScheduleConflicts([nightShift, overnightEvent], somaShiftWindows)).toMatchObject([
      { date: "2026-10-06", firstEntryId: nightShift.id, secondEntryId: overnightEvent.id, type: "HORARIO" },
    ])
  })

  it("reports a vacation overlap without adding financial penalties", () => {
    const vacation: CalendarEntry = {
      id: "vacation",
      date: "2026-10-04",
      endDate: "2026-10-06",
      kind: "VACACIONES",
      title: "VACACIONES",
    }

    expect(findScheduleConflicts([vacation, reservedShift])).toMatchObject([{ date: "2026-10-05", type: "VACACIONES" }])
  })

  it("blocks availability throughout a vacation range and reports only in-range conflicts", () => {
    const vacation: CalendarEntry = {
      id: "vacation-week",
      date: "2026-10-07",
      endDate: "2026-10-13",
      kind: "VACACIONES",
      title: "VACACIONES",
    }
    const insideShift = { ...reservedShift, id: "inside-shift", date: "2026-10-13", status: "TURNO" as const }
    const outsideShift = { ...reservedShift, id: "outside-shift", date: "2026-10-14", status: "TURNO" as const }

    for (const date of ["2026-10-07", "2026-10-10", "2026-10-13"]) {
      expect(getDayAvailability([vacation], date)).toBe("VACACIONES")
      expect(getEntriesForDate([vacation], new Date(`${date}T12:00:00`))).toContain(vacation)
    }
    expect(getDayAvailability([vacation], "2026-10-06")).toBe("LIBRE")
    expect(getDayAvailability([vacation], "2026-10-14")).toBe("LIBRE")
    expect(findScheduleConflicts([vacation, insideShift, outsideShift])).toMatchObject([
      { date: "2026-10-13", firstEntryId: vacation.id, secondEntryId: insideShift.id, type: "VACACIONES" },
    ])
  })

  it("treats an annual vacation without an end date as open until next year's plan is set", () => {
    const vacation: CalendarEntry = {
      id: "annual-vacation",
      date: "2026-12-24",
      kind: "VACACIONES",
      title: "VACACIONES",
    }

    expect(getDayAvailability([vacation], "2026-12-23")).toBe("LIBRE")
    expect(getDayAvailability([vacation], "2027-01-12")).toBe("VACACIONES")
  })

  it("counts R1-R5 turn names as worked hours and excludes LIBRE", () => {
    const entries: CalendarEntry[] = [
      reservedShift,
      { ...reservedShift, id: "r5-pm", status: "R5", period: "PM" },
      { ...reservedShift, id: "free-am", status: "LIBRE" },
      { ...reservedShift, id: "october-turn", date: "2026-10-06", status: "TURNO" },
      { ...reservedShift, id: "november-reservation", date: "2026-11-01", status: "R1" },
    ]

    expect(getMonthSomaShiftCount(entries, new Date("2026-10-01T12:00:00"))).toBe(3)
    expect(getMonthShiftHours(entries, new Date("2026-10-01T12:00:00"))).toBe(18)
  })

  it("groups covered jornadas by anesthesiologist and values nights as two jornadas", () => {
    const coveredEntries: CalendarEntry[] = [
      { ...reservedShift, id: "patricia-am", status: "TURNO_OTRA_PERSONA", anesthesiologist: "Patricia" },
      {
        ...reservedShift,
        id: "patricia-night",
        status: "TURNO_OTRA_PERSONA",
        period: "NOCHE",
        anesthesiologist: " Patricia ",
      },
      { ...reservedShift, id: "sara-pm", status: "TURNO_OTRA_PERSONA", period: "PM", anesthesiologist: "Sara" },
      { ...reservedShift, id: "uncovered", status: "TURNO_OTRA_PERSONA", period: "PM" },
      { ...reservedShift, id: "own-turn", status: "TURNO", period: "PM", anesthesiologist: "No contar" },
    ]

    expect(
      getCoveredShiftSummary(coveredEntries, new Date("2026-10-01T12:00:00"), [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
      ]),
    ).toEqual({
      rows: [
        { anesthesiologist: "Patricia", jornadas: 3, totalAmountThousands: 2_055 },
        { anesthesiologist: "Sara", jornadas: 1, totalAmountThousands: 685 },
        { anesthesiologist: "Sin nombre registrado", jornadas: 1, totalAmountThousands: 685 },
      ],
      totalJornadas: 5,
      totalAmountThousands: 3_425,
    })
  })

  it("keeps past covered jornadas at their original rate after a new rate takes effect", () => {
    const coveredEntries: CalendarEntry[] = [
      {
        ...reservedShift,
        id: "past-am",
        date: "2026-10-06",
        status: "TURNO_OTRA_PERSONA",
        anesthesiologist: "Patricia",
      },
      {
        ...reservedShift,
        id: "today-pm",
        date: "2026-10-07",
        status: "TURNO_OTRA_PERSONA",
        period: "PM",
        anesthesiologist: "Patricia",
      },
      {
        ...reservedShift,
        id: "future-double",
        date: "2026-10-08",
        status: "TURNO_OTRA_PERSONA",
        period: "AM + PM",
        anesthesiologist: "Patricia",
      },
    ]
    const rates = [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
      { effectiveFrom: "2026-10-08", amountThousands: 700 },
    ]

    expect(getCoveredShiftSummary(coveredEntries, new Date("2026-10-01T12:00:00"), rates)).toEqual({
      rows: [{ anesthesiologist: "Patricia", jornadas: 4, totalAmountThousands: 2_770 }],
      totalJornadas: 4,
      totalAmountThousands: 2_770,
    })
  })

  it("shows LIBRE only for missing AM/PM slots without another record that day", () => {
    const date = new Date("2026-10-05T12:00:00")
    const emptyDay = getEntriesForDate([], date)
    expect(emptyDay.map((entry) => [entry.period, entry.status, entry.isFallback])).toEqual([
      ["AM", "LIBRE", true],
      ["PM", "LIBRE", true],
    ])

    const amTurn: CalendarEntry = { ...reservedShift, status: "TURNO" }
    expect(getEntriesForDate([amTurn], date).map((entry) => [entry.period, entry.status])).toEqual([
      ["AM", "TURNO"],
      ["PM", "LIBRE"],
    ])

    const event: CalendarEntry = { id: "event", date: "2026-10-05", kind: "PERSONAL", title: "Cita" }
    expect(getEntriesForDate([event], date)).toEqual([event])
    expect(getEntriesForDate([], date, false)).toEqual([])
  })

  it("keeps AM free for a Sedarte event starting in the afternoon", () => {
    const date = new Date("2026-10-02T12:00:00")
    const sedation: CalendarEntry = {
      id: "sedarte-pm",
      date: "2026-10-02",
      kind: "SEDARTE",
      title: "Sedación",
      startTime: "14:30",
      durationHours: 2,
    }
    const entries = getEntriesForDate([sedation], date)

    expect(entries.map((entry) => (entry.kind === "SOMA" ? `${entry.status} ${entry.period}` : entry.title))).toEqual([
      "LIBRE AM",
      "Sedación",
    ])
    expect(entries.some((entry) => entry.isFallback && entry.period === "AM")).toBe(true)
    expect(entries.some((entry) => entry.isFallback && entry.period === "PM")).toBe(false)
    expect(entries).toContain(sedation)
  })

  it("does not mark either half-day free when an event crosses noon", () => {
    const event: CalendarEntry = {
      id: "cross-noon",
      date: "2026-10-02",
      kind: "SEDARTE",
      title: "Sedación",
      startTime: "11:00",
      durationHours: 2,
    }

    expect(getEntriesForDate([event], new Date("2026-10-02T12:00:00")).some((entry) => entry.isFallback)).toBe(false)
  })
})
