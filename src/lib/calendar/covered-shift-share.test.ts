import { describe, expect, it } from "vitest"
import { getCoveredShiftDetails } from "./coverage-compensation"
import { buildCoveredShiftShareText } from "./covered-shift-share"
import type { CalendarEntry } from "./types"

const entries: CalendarEntry[] = [
  {
    id: "ana-am",
    date: "2026-10-06",
    kind: "SOMA",
    status: "TURNO_OTRA_PERSONA",
    period: "AM",
    anesthesiologist: "Ana",
    title: "AM",
  },
  {
    id: "ana-night",
    date: "2026-10-08",
    kind: "SOMA",
    status: "TURNO_OTRA_PERSONA",
    period: "NOCHE",
    anesthesiologist: "Ana",
    title: "Noche",
  },
  {
    id: "bea-pm",
    date: "2026-10-09",
    kind: "SOMA",
    status: "TURNO_OTRA_PERSONA",
    period: "PM",
    anesthesiologist: "Bea",
    title: "PM",
  },
]

describe("covered shift share", () => {
  it("reports selected historical-rate totals without individual shift dates", () => {
    const shifts = getCoveredShiftDetails(entries, new Date("2026-10-01T12:00:00"), [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
      { effectiveFrom: "2026-10-08", amountThousands: 700 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(["ana-night"]), new Date("2026-10-01T12:00:00"))).toBe(
      ["*Jornadas cubiertas · octubre 2026*", "", "*Ana*", "• 2 jornadas · $1.400.000"].join("\n"),
    )
  })

  it("exports each person's amount and the grand total in full pesos", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails(entries, month, [{ effectiveFrom: "1900-01-01", amountThousands: 685.125 }])
    const text = buildCoveredShiftShareText(shifts, new Set(["ana-am", "bea-pm"]), month)

    expect(text).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        "• 1 jornada · $685.125",
        "",
        "*Bea*",
        "• 1 jornada · $685.125",
        "",
        "*Total: 2 jornadas · $1.370.250*",
      ].join("\n"),
    )
  })

  it("lists selected dates and periods with amounts only in the person's total", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails(entries, month, [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
      { effectiveFrom: "2026-10-08", amountThousands: 700 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(["ana-am", "ana-night"]), month, true)).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        "• 6 oct · AM",
        "• 8 oct · NOCHE",
        "*Total: 3 jornadas · $2.085.000*",
      ].join("\n"),
    )
  })

  it("includes a grand total for multiple anesthesiologists with date details", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails(entries, month, [{ effectiveFrom: "1900-01-01", amountThousands: 685 }])

    expect(buildCoveredShiftShareText(shifts, new Set(["ana-am", "bea-pm"]), month, true)).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        "• 6 oct · AM",
        "*Total: 1 jornada · $685.000*",
        "",
        "*Bea*",
        "• 9 oct · PM",
        "*Total: 1 jornada · $685.000*",
        "",
        "*Total: 2 jornadas · $1.370.000*",
      ].join("\n"),
    )
  })

  it("keeps combined AM + PM periods in the date breakdown", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails([{ ...entries[0], period: "AM + PM" }], month, [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(["ana-am"]), month, true)).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        "• 6 oct · AM + PM",
        "*Total: 2 jornadas · $1.370.000*",
      ].join("\n"),
    )
  })

  it.each([
    { selectedIds: ["ana-am", "ana-pm"], period: "AM + PM", jornadas: 2, amount: "$1.370.000" },
    { selectedIds: ["ana-am"], period: "AM", jornadas: 1, amount: "$685.000" },
    { selectedIds: ["ana-pm"], period: "PM", jornadas: 1, amount: "$685.000" },
  ])("groups selected periods as $period on one date line", ({ selectedIds, period, jornadas, amount }) => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails([entries[0], { ...entries[0], id: "ana-pm", period: "PM" }], month, [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(selectedIds), month, true)).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        `• 6 oct · ${period}`,
        `*Total: ${jornadas} ${jornadas === 1 ? "jornada" : "jornadas"} · ${amount}*`,
      ].join("\n"),
    )
  })

  it("does not combine periods covered by different anesthesiologists on the same date", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails([entries[0], { ...entries[2], date: entries[0].date }], month, [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
    ])
    const text = buildCoveredShiftShareText(shifts, new Set(["ana-am", "bea-pm"]), month, true)

    expect(text).toContain("*Ana*\n• 6 oct · AM\n")
    expect(text).toContain("*Bea*\n• 6 oct · PM\n")
    expect(text).not.toContain("AM + PM")
    expect(text).toContain("*Total: 2 jornadas · $1.370.000*")
  })

  it("returns an empty report when no shifts are selected", () => {
    const shifts = getCoveredShiftDetails(entries, new Date("2026-10-01T12:00:00"), [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(), new Date("2026-10-01T12:00:00"))).toBe("")
    expect(buildCoveredShiftShareText(shifts, new Set(), new Date("2026-10-01T12:00:00"), true)).toBe("")
  })
})
