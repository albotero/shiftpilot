import { describe, expect, it } from "vitest"
import {
  getSomaAnnualPlanKey,
  getSomaAutomaticNightDates,
  getSomaAutomaticStatus,
  getSomaYearEndWindow,
  somaAnnualPlanSchema,
} from "./annual-plan"

const plan2026 = {
  year: 2026,
  mainStartDate: "2026-01-13",
  mainEndDate: "2026-12-23",
  anchorDate: "2026-10-01",
  anchorStatus: "TURNO",
  yearEndMode: "UNPLANNED",
} as const

describe("annual Soma plan", () => {
  it("accepts a defined main range and explicit rotation anchor", () => {
    expect(somaAnnualPlanSchema.safeParse(plan2026).success).toBe(true)
  })

  it("leaves the year-end gap unplanned until next year's main range is defined", () => {
    expect(getSomaYearEndWindow(plan2026)).toEqual({
      mode: "UNPLANNED",
      startDate: "2026-12-24",
      endDate: null,
    })
  })

  it("closes the prior year-end block on the day before the next main range", () => {
    const nextPlan = {
      ...plan2026,
      year: 2027,
      mainStartDate: "2027-01-13",
      mainEndDate: "2027-12-20",
      anchorDate: "2027-01-13",
      anchorStatus: "R4" as const,
      yearEndMode: "ALTERNATE" as const,
    }

    expect(getSomaYearEndWindow(plan2026, nextPlan)).toEqual({
      mode: "UNPLANNED",
      startDate: "2026-12-24",
      endDate: "2027-01-12",
    })
  })

  it("names settings by calendar year", () => {
    expect(getSomaAnnualPlanKey(2027)).toBe("soma.annualPlan.2027")
  })

  it("returns the configured main rotation status, including LIBRE", () => {
    const plans = new Map([[2026, plan2026]])

    expect(getSomaAutomaticStatus("2026-10-01", plans)).toBe("TURNO")
    expect(getSomaAutomaticStatus("2026-10-02", plans)).toBe("LIBRE")
  })

  it("returns the alternate rotation status in a configured year-end window", () => {
    const previousPlan = {
      ...plan2026,
      year: 2024,
      mainStartDate: "2024-01-13",
      mainEndDate: "2024-12-23",
      anchorDate: "2024-10-01",
      yearEndMode: "ALTERNATE" as const,
    }
    const nextPlan = {
      ...plan2026,
      year: 2025,
      mainStartDate: "2025-01-13",
      mainEndDate: "2025-12-23",
      anchorDate: "2025-10-01",
    }
    const plans = new Map<number, typeof previousPlan | typeof nextPlan>([
      [2024, previousPlan],
      [2025, nextPlan],
    ])

    expect(getSomaAutomaticStatus("2025-01-09", plans)).toBe("R1")
  })

  it("returns undefined when the date has no configured automatic rotation", () => {
    expect(getSomaAutomaticStatus("2032-01-11", new Map())).toBeUndefined()
  })

  it("associates automatic NOCHE shifts only with TURNO dates", () => {
    const nightDates = getSomaAutomaticNightDates(new Map([[2026, plan2026]]))

    expect(nightDates).toContain("2026-10-01")
    expect(nightDates).not.toContain("2026-10-02")
    expect(nightDates).not.toContain("2026-10-05")
  })
})
