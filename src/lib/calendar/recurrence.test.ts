import { describe, expect, it } from "vitest"
import { expandWeeklyRecurrence } from "./recurrence"

const saturdayRule = {
  id: "weekly-personal",
  kind: "PERSONAL" as const,
  startDate: "2026-10-03",
  endDate: "2026-10-17",
  weekday: 6,
  skipHolidays: false,
  title: "Cita personal",
}

describe("weekly calendar recurrence expansion", () => {
  it("expands Saturdays through the inclusive end date", () => {
    const entries = expandWeeklyRecurrence(saturdayRule, "2026-10-01", "2026-10-31")

    expect(entries.map((entry) => entry.date)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17"])
    expect(entries.every((entry) => entry.recurrenceId === saturdayRule.id)).toBe(true)
  })

  it("supports an indefinite series while limiting expansion to the visible range", () => {
    const entries = expandWeeklyRecurrence({ ...saturdayRule, endDate: null }, "2026-10-10", "2026-10-24")

    expect(entries.map((entry) => entry.date)).toEqual(["2026-10-10", "2026-10-17", "2026-10-24"])
  })

  it("omits Colombian holidays only when the rule requests it", () => {
    const rule = { ...saturdayRule, startDate: "2026-10-05", endDate: "2026-10-19", weekday: 1 }

    expect(
      expandWeeklyRecurrence({ ...rule, skipHolidays: true }, "2026-10-01", "2026-10-31").map((entry) => entry.date),
    ).toEqual(["2026-10-05", "2026-10-19"])
    expect(
      expandWeeklyRecurrence({ ...rule, skipHolidays: false }, "2026-10-01", "2026-10-31").map((entry) => entry.date),
    ).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"])
  })

  it("expands AM + PM as two distinct recurring shifts", () => {
    const entries = expandWeeklyRecurrence(
      {
        id: "weekly-soma",
        kind: "SOMA",
        startDate: "2026-10-03",
        endDate: "2026-10-03",
        weekday: 6,
        skipHolidays: false,
        title: "TURNO",
        status: "TURNO",
        period: "AM_PM",
      },
      "2026-10-01",
      "2026-10-31",
    )

    expect(entries.map((entry) => [entry.date, entry.period])).toEqual([
      ["2026-10-03", "AM"],
      ["2026-10-03", "PM"],
    ])
  })

  it("overrides only the selected occurrence and leaves earlier and later dates intact", () => {
    const entries = expandWeeklyRecurrence(saturdayRule, "2026-10-03", "2026-10-17", [
      { date: "2026-10-10", title: "Cita reprogramada", startTime: "09:30", durationMinutes: 90 },
    ])

    expect(entries.map((entry) => [entry.date, entry.title, entry.startTime])).toEqual([
      ["2026-10-03", "Cita personal", undefined],
      ["2026-10-10", "Cita reprogramada", "09:30"],
      ["2026-10-17", "Cita personal", undefined],
    ])
  })

  it("expands all selected weekdays in the week", () => {
    const entries = expandWeeklyRecurrence(
      { ...saturdayRule, startDate: "2026-10-05", endDate: null, weekdays: [1, 3] },
      "2026-10-01",
      "2026-10-21",
    )

    expect(entries.map((entry) => entry.date)).toEqual([
      "2026-10-05",
      "2026-10-07",
      "2026-10-12",
      "2026-10-14",
      "2026-10-19",
      "2026-10-21",
    ])
  })

  it("repeats monthly on a chosen day and clamps it to shorter months", () => {
    const entries = expandWeeklyRecurrence(
      {
        ...saturdayRule,
        frequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: null,
        dayOfMonth: 31,
      },
      "2026-01-01",
      "2026-04-30",
    )

    expect(entries.map((entry) => entry.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])
  })

  it("repeats on the last day of each month", () => {
    const entries = expandWeeklyRecurrence(
      {
        ...saturdayRule,
        frequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: null,
        lastDayOfMonth: true,
      },
      "2026-01-01",
      "2026-04-30",
    )

    expect(entries.map((entry) => entry.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])
  })

  it("repeats every N days from the start date", () => {
    const entries = expandWeeklyRecurrence(
      {
        ...saturdayRule,
        frequency: "INTERVAL",
        startDate: "2026-10-03",
        endDate: null,
        intervalDays: 3,
      },
      "2026-10-03",
      "2026-10-12",
    )
    expect(entries.map((entry) => entry.date)).toEqual(["2026-10-03", "2026-10-06", "2026-10-09", "2026-10-12"])
  })

  it("inherits reminder settings and allows an occurrence exception to disable them", () => {
    const entries = expandWeeklyRecurrence(
      {
        ...saturdayRule,
        endDate: null,
        reminderEnabled: true,
        reminderMode: "MINUTES_BEFORE",
        reminderMinutesBefore: 45,
      },
      "2026-10-03",
      "2026-10-17",
      [{ date: "2026-10-10", title: "Cita personal", reminderEnabled: false }],
    )

    expect(entries.map((entry) => [entry.date, entry.reminderEnabled, entry.reminderMinutesBefore])).toEqual([
      ["2026-10-03", true, 45],
      ["2026-10-10", false, 45],
      ["2026-10-17", true, 45],
    ])
  })
})
