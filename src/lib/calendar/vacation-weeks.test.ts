import { describe, expect, it } from "vitest"
import { getVacationEndDate, getVacationWeekCount, isCompleteVacationRange } from "./vacation-weeks"

describe("full-week vacation ranges", () => {
  it("allows a week to start on any weekday and returns its seventh day", () => {
    expect(getVacationEndDate("2026-10-07", 1)).toBe("2026-10-13")
    expect(getVacationWeekCount("2026-10-07", "2026-10-13")).toBe(1)
  })

  it("supports multiple complete weeks", () => {
    expect(getVacationEndDate("2026-12-24", 2)).toBe("2027-01-06")
    expect(isCompleteVacationRange("2026-12-24", "2027-01-06")).toBe(true)
  })

  it("rejects partial week ranges and invalid week counts", () => {
    expect(isCompleteVacationRange("2026-10-07", "2026-10-12")).toBe(false)
    expect(isCompleteVacationRange("2026-10-07", "2026-10-14")).toBe(false)
    expect(() => getVacationEndDate("2026-10-07", 0)).toThrow(RangeError)
  })
})
