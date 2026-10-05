import { describe, expect, it } from "vitest"
import { getColombianHolidays } from "./colombian-holidays"
import { generateSomaAlternate, generateSomaRotation, generateSomaYear, getScheduledSomaDays } from "./soma-rotation"

describe("Soma rotation for Q4 2026", () => {
  const days = generateSomaRotation("2026-10-01", "2026-12-31", "2026-10-01", "TURNO")
  const byDate = new Map(days.map((day) => [day.date, day]))

  it("starts at TURNO and advances one state for every calendar day", () => {
    expect(days).toHaveLength(92)
    expect(byDate.get("2026-10-01")?.status).toBe("TURNO")
    expect(byDate.get("2026-10-02")?.status).toBe("LIBRE")
    expect(byDate.get("2026-10-05")?.status).toBe("R2")
  })

  it("keeps only sequence R1/TURNO on Saturdays and makes other Saturdays free", () => {
    for (const day of days) {
      const weekday = new Date(`${day.date}T12:00:00.000Z`).getUTCDay()
      if (weekday === 6) expect(["LIBRE", "R1", "TURNO"]).toContain(day.status)
      if (weekday === 0) expect(["LIBRE", "TURNO"]).toContain(day.status)
    }

    expect(byDate.get("2026-10-03")?.status).toBe("LIBRE")
    expect(byDate.get("2026-10-24")?.status).toBe("R1")
    expect(byDate.get("2026-10-31")?.status).toBe("TURNO")
    expect(byDate.get("2026-10-04")?.status).toBe("LIBRE")
  })

  it("continues the sequence through weekends", () => {
    expect(byDate.get("2026-11-06")?.status).toBe("TURNO")
    expect(byDate.get("2026-11-07")?.status).toBe("LIBRE")
    expect(byDate.get("2026-11-08")?.status).toBe("LIBRE")
    expect(byDate.get("2026-11-09")?.status).toBe("R3")
  })

  it("calculates Colombian national holiday dates for 2026 and 2027", () => {
    expect(
      getColombianHolidays(2026)
        .filter((holiday) => holiday.date >= "2026-10-01")
        .map((holiday) => [holiday.date, holiday.name]),
    ).toEqual([
      ["2026-10-12", "Día de la Raza"],
      ["2026-11-02", "Todos los Santos"],
      ["2026-11-16", "Independencia de Cartagena"],
      ["2026-12-08", "Inmaculada Concepción"],
      ["2026-12-25", "Navidad"],
    ])
    expect(
      getColombianHolidays(2027)
        .filter((holiday) => holiday.date >= "2027-10-01")
        .map((holiday) => holiday.date),
    ).toEqual(["2027-10-18", "2027-11-01", "2027-11-15", "2027-12-08", "2027-12-25"])
  })

  it("allows work on a Colombian holiday only when the resulting status is TURNO", () => {
    const holidays = getColombianHolidays(2026).filter((holiday) => holiday.date >= "2026-10-01")
    for (const holiday of holidays) {
      const day = byDate.get(holiday.date)
      expect(day?.isHoliday).toBe(true)
      if (day?.status !== "TURNO") expect(day?.status).toBe("LIBRE")
    }
  })

  it("does not materialize LIBRE rotation days as Shift records", () => {
    const scheduledDays = getScheduledSomaDays(days)
    expect(scheduledDays.length).toBeLessThan(days.length)
    expect(scheduledDays.every((day) => day.status !== "LIBRE")).toBe(true)
    expect(scheduledDays.length * 2).toBeGreaterThan(0)
  })

  it("generates a complete future year from its own explicit anchor", () => {
    const year = generateSomaYear(2027, "2027-01-04", "R4")
    const byDate = new Map(year.map((day) => [day.date, day]))

    expect(year).toHaveLength(365)
    expect(byDate.get("2027-01-04")?.status).toBe("R4")

    const leapYear = generateSomaYear(2028, "2028-01-01", "TURNO")
    expect(leapYear).toHaveLength(366)
    expect(leapYear[0].status).toBe("TURNO")
  })

  it("uses the three-day R2-R1-T cycle for an alternate year-end block", () => {
    const days = generateSomaAlternate("2027-12-23", "2028-01-12")
    const byDate = new Map(days.map((day) => [day.date, day]))

    expect(byDate.get("2027-12-23")?.status).toBe("R2")
    expect(byDate.get("2027-12-24")?.status).toBe("R1")
    expect(byDate.get("2027-12-25")?.status).toBe("TURNO")
    expect(byDate.get("2027-12-26")?.status).toBe("LIBRE")
    expect(byDate.get("2027-12-27")?.status).toBe("R1")
    expect(byDate.get("2027-12-28")?.status).toBe("TURNO")
    expect(byDate.get("2028-01-12")?.date).toBe("2028-01-12")
  })
})
