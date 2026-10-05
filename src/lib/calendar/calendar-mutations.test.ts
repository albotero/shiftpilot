import { describe, expect, it } from "vitest"
import { createCalendarEntrySchema, deleteCalendarEntrySchema } from "./create-schema"

describe("calendar event and vacation mutations", () => {
  it("accepts a rescheduled Sedarte event with its start time and duration", () => {
    expect(
      createCalendarEntrySchema.safeParse({
        id: "sedarte-1",
        date: "2026-10-07",
        kind: "SEDARTE",
        title: "Procedimiento",
        startTime: "09:30",
        durationHours: 2,
      }).success,
    ).toBe(true)
  })

  it("does not model Sedarte events with Soma periods", () => {
    const sedarte = {
      id: "sedarte-1",
      date: "2026-10-07",
      kind: "SEDARTE",
      title: "Procedimiento",
      startTime: "09:30",
      durationHours: 2,
    }

    expect(createCalendarEntrySchema.safeParse(sedarte).success).toBe(true)
    expect(createCalendarEntrySchema.safeParse({ ...sedarte, period: "AM" }).success).toBe(false)
  })

  it("requires a non-empty title for Sedarte events", () => {
    const sedarte = {
      id: "sedarte-1",
      date: "2026-10-07",
      kind: "SEDARTE",
      title: " ",
      startTime: "09:30",
      durationHours: 2,
    }

    expect(createCalendarEntrySchema.safeParse(sedarte).success).toBe(false)
  })

  it("accepts personal events with no time or with a complete time/duration pair", () => {
    const base = { id: "personal-1", date: "2026-10-07", kind: "PERSONAL", title: "Cita médica" }
    expect(createCalendarEntrySchema.safeParse(base).success).toBe(true)
    expect(createCalendarEntrySchema.safeParse({ ...base, startTime: "09:30", durationHours: 2 }).success).toBe(true)
    expect(createCalendarEntrySchema.safeParse({ ...base, startTime: "09:30" }).success).toBe(false)
  })

  it("accepts vacation date changes only for complete weeks, including across years", () => {
    const base = { id: "vacation-1", kind: "VACACIONES", title: "VACACIONES" }
    expect(createCalendarEntrySchema.safeParse({ ...base, date: "2026-12-20", endDate: "2027-01-02" }).success).toBe(
      true,
    )
    expect(createCalendarEntrySchema.safeParse({ ...base, date: "2026-12-20", endDate: "2027-01-01" }).success).toBe(
      false,
    )
  })

  it("permits Soma restoration requests and deletes for events and manual vacations", () => {
    expect(deleteCalendarEntrySchema.safeParse({ id: "event-1", kind: "SEDARTE" }).success).toBe(true)
    expect(deleteCalendarEntrySchema.safeParse({ id: "event-2", kind: "PERSONAL" }).success).toBe(true)
    expect(deleteCalendarEntrySchema.safeParse({ id: "vacation-1", kind: "VACACIONES" }).success).toBe(true)
    expect(deleteCalendarEntrySchema.safeParse({ id: "shift-1", kind: "SOMA" }).success).toBe(true)
  })
})
