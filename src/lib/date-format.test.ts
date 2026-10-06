import { describe, expect, it } from "vitest"
import { formatDateDmy, parseDateDmy } from "./date-format"

describe("day/month/year date format", () => {
  it("formats and parses ISO dates without changing the calendar day", () => {
    expect(formatDateDmy("2026-09-15")).toBe("15/09/2026")
    expect(parseDateDmy("15/09/2026")).toBe("2026-09-15")
  })

  it("rejects US month/day order and impossible dates", () => {
    expect(parseDateDmy("09/15/2026")).toBeNull()
    expect(parseDateDmy("31/02/2026")).toBeNull()
    expect(parseDateDmy("1/9/2026")).toBeNull()
  })
})
