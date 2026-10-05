import { describe, expect, it } from "vitest"
import { somaAnnualPlanSchema } from "./annual-plan"
import { createCalendarEntrySchema } from "./create-schema"
import { calendarEntrySchema } from "./schema"
import { generateSomaRotation, generateSomaYear } from "./soma-rotation"
import { getEntryLabel } from "./utils"

const manualR5Entry = {
  id: "manual-r5",
  date: "2026-10-13",
  kind: "SOMA",
  status: "R5",
  period: "AM",
  title: "R5",
} as const

describe("manual R5 status", () => {
  it("accepts R5 in manual calendar entry validation", () => {
    expect(createCalendarEntrySchema.safeParse(manualR5Entry).success).toBe(true)
    expect(calendarEntrySchema.safeParse(manualR5Entry).success).toBe(true)
    expect(getEntryLabel({ ...manualR5Entry, kind: "SOMA" })).toBe("Adicional AM")
  })

  it("accepts a manual NOCHE shift with its own 12-hour period", () => {
    const nightEntry = { ...manualR5Entry, status: "NOCHE", period: "NOCHE", title: "NOCHE" }
    expect(createCalendarEntrySchema.safeParse(nightEntry).success).toBe(true)
    expect(calendarEntrySchema.safeParse(nightEntry).success).toBe(true)
  })

  it("accepts other-person and external work as manual Soma statuses", () => {
    for (const status of [
      "NOCHE",
      "TURNO_OTRA_PERSONA",
      "TURNO_DE_OTRA_PERSONA",
      "EXTERNO",
      "EXTERNO_NOCHE",
    ] as const) {
      const entry = { ...manualR5Entry, status, title: status }
      expect(createCalendarEntrySchema.safeParse(entry).success).toBe(true)
      expect(calendarEntrySchema.safeParse(entry).success).toBe(true)
    }
  })

  it("never generates R5 or manual external statuses from main or alternate rotation", () => {
    const ranges = [
      generateSomaRotation("2026-10-01", "2026-12-31", "2026-10-01", "TURNO"),
      generateSomaYear(2027, "2027-01-13", "R4"),
    ]

    const manualStatuses = ["R5", "NOCHE", "TURNO_OTRA_PERSONA", "TURNO_DE_OTRA_PERSONA", "EXTERNO", "EXTERNO_NOCHE"]
    expect(ranges.flat().some((day) => manualStatuses.includes(day.status))).toBe(false)
  })

  it("does not allow R5 to be used as an annual rotation anchor", () => {
    expect(
      somaAnnualPlanSchema.safeParse({
        year: 2026,
        mainStartDate: "2026-01-13",
        mainEndDate: "2026-12-23",
        anchorDate: "2026-10-01",
        anchorStatus: "R5",
        yearEndMode: "UNPLANNED",
      }).success,
    ).toBe(false)
  })
})
