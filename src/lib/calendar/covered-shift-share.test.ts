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

    expect(
      buildCoveredShiftShareText(shifts, new Set(["ana-night"]), new Date("2026-10-01T12:00:00")),
    ).toBe(
      [
        "*Jornadas cubiertas · octubre 2026*",
        "",
        "*Ana*",
        "• 2 jornadas · $1.400.000",
        "",
        "*Total: 2 jornadas · $1.400.000*",
      ].join("\n"),
    )
  })

  it("exports each person's amount and the grand total in full pesos", () => {
    const month = new Date("2026-10-01T12:00:00")
    const shifts = getCoveredShiftDetails(entries, month, [
      { effectiveFrom: "1900-01-01", amountThousands: 685.125 },
    ])
    const text = buildCoveredShiftShareText(shifts, new Set(["ana-am", "bea-pm"]), month)

    expect(text).toBe([
      "*Jornadas cubiertas · octubre 2026*",
      "",
      "*Ana*",
      "• 1 jornada · $685.125",
      "",
      "*Bea*",
      "• 1 jornada · $685.125",
      "",
      "*Total: 2 jornadas · $1.370.250*",
    ].join("\n"))
  })

  it("returns an empty report when no shifts are selected", () => {
    const shifts = getCoveredShiftDetails(entries, new Date("2026-10-01T12:00:00"), [
      { effectiveFrom: "1900-01-01", amountThousands: 685 },
    ])

    expect(buildCoveredShiftShareText(shifts, new Set(), new Date("2026-10-01T12:00:00"))).toBe("")
  })
})
