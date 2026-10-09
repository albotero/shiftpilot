import { describe, expect, it } from "vitest"
import { compareCalendarEntriesByStart, isUpcomingCalendarEntry } from "@/lib/calendar/utils"
import type { CalendarEntry } from "@/lib/calendar/types"

const today = "2026-10-09"

const event: CalendarEntry = {
  id: "event",
  date: today,
  kind: "PERSONAL",
  title: "Appointment",
  startTime: "09:30",
}

describe("isUpcomingCalendarEntry", () => {
  it("excludes events that have already started today", () => {
    expect(isUpcomingCalendarEntry(event, today, 9 * 60 + 30)).toBe(false)
    expect(isUpcomingCalendarEntry(event, today, 10 * 60)).toBe(false)
  })

  it("keeps timed events that have not started and events on later days", () => {
    expect(isUpcomingCalendarEntry(event, today, 9 * 60 + 29)).toBe(true)
    expect(isUpcomingCalendarEntry({ ...event, date: "2026-10-10" }, today, 10 * 60)).toBe(true)
  })

  it("keeps untimed all-day entries visible today", () => {
    expect(isUpcomingCalendarEntry({ ...event, startTime: undefined }, today, 10 * 60)).toBe(true)
  })

  it("uses shift period start times", () => {
    const morningShift: CalendarEntry = {
      id: "morning-shift",
      date: today,
      kind: "SOMA",
      status: "TURNO",
      period: "AM",
      title: "Turno AM",
    }

    expect(isUpcomingCalendarEntry(morningShift, today, 6 * 60 + 59)).toBe(true)
    expect(isUpcomingCalendarEntry(morningShift, today, 7 * 60)).toBe(false)
  })
})

describe("compareCalendarEntriesByStart", () => {
  it("orders by date and then by start time", () => {
    const entries: CalendarEntry[] = [
      { ...event, id: "tomorrow-early", date: "2026-10-10", startTime: "06:00" },
      { ...event, id: "late", startTime: "18:00" },
      { id: "pm-shift", date: today, kind: "SOMA", title: "TURNO", period: "PM" },
      { ...event, id: "early", startTime: "08:15" },
      { ...event, id: "all-day", startTime: undefined },
    ]
    expect(entries.sort(compareCalendarEntriesByStart).map((entry) => entry.id)).toEqual([
      "all-day",
      "early",
      "pm-shift",
      "late",
      "tomorrow-early",
    ])
  })
})
