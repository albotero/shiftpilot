import { describe, expect, it } from "vitest"
import { findScheduleConflicts, getDayAvailability } from "@/lib/calendar/availability"
import {
  getEntryLabel,
  getEntryTone,
  getEntriesForDate,
  getMonthShiftHours,
  getMonthSomaShiftCount,
  isSomaWorkStatus,
} from "@/lib/calendar/utils"
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
  it("keeps a Soma reservation distinct from free time", () => {
    expect(getDayAvailability([reservedShift], "2026-10-05")).toBe("RESERVA")
    expect(getDayAvailability([{ ...reservedShift, status: "R2" }], "2026-10-05")).toBe("RESERVA")
    expect(getDayAvailability([], "2026-10-05")).toBe("LIBRE")
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
    expect(getMonthShiftHours([coveredShift, ownTurn], new Date("2026-10-01T12:00:00"))).toBe(6)
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
    expect(getMonthSomaShiftCount([borrowedShift], new Date("2026-10-01T12:00:00"))).toBe(1)
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
    expect(dayEntries.some((entry) => entry.isFallback && entry.period === "AM")).toBe(true)
    expect(dayEntries.some((entry) => entry.isFallback && entry.period === "PM")).toBe(true)
    expect(getMonthSomaShiftCount([nightShift], new Date("2026-10-01T12:00:00"))).toBe(1)
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

  it("counts reservations as Soma turns and excludes LIBRE", () => {
    const entries: CalendarEntry[] = [
      reservedShift,
      { ...reservedShift, id: "r5-pm", status: "R5", period: "PM" },
      { ...reservedShift, id: "free-am", status: "LIBRE" },
      { ...reservedShift, id: "october-turn", date: "2026-10-06", status: "TURNO" },
      { ...reservedShift, id: "november-reservation", date: "2026-11-01", status: "R1" },
    ]

    expect(getMonthSomaShiftCount(entries, new Date("2026-10-01T12:00:00"))).toBe(3)
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
