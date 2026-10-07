import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { DELETE, GET, PUT } from "./route"
import { getCoveredShiftRateForDate } from "@/lib/calendar/coverage-compensation"

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/calendar/coverage-rate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.appSetting.findUnique.mockResolvedValue(null)
  prismaMock.appSetting.upsert.mockResolvedValue({})
})

describe("covered shift rate route", () => {
  it("uses the default rate in thousands of COP until one is configured", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      amountThousands: 685,
      configuredAmountThousands: 685,
      rates: [{ effectiveFrom: "1900-01-01", amountThousands: 685 }],
    })
  })

  it("returns configured history in thousands of COP", async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-08", amountThousands: 700 },
      ],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      amountThousands: 685,
      configuredAmountThousands: 700,
      rates: [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-08", amountThousands: 700 },
      ],
    })
  })

  it("makes a changed rate effective tomorrow and preserves the previous history", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [{ effectiveFrom: "1900-01-01", amountThousands: 685 }],
    })
    try {
      const response = await PUT(jsonRequest({ amountThousands: 700 }))
      const result = await response.json()
      const rateHistory = [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-08", amountThousands: 700 },
      ]

      expect(response.status).toBe(200)
      expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: "calendar.coveredShiftRateThousands" },
        create: { key: "calendar.coveredShiftRateThousands", value: rateHistory },
        update: { value: rateHistory },
      })
      expect(result).toMatchObject({
        amountThousands: 685,
        configuredAmountThousands: 700,
        effectiveFrom: "2026-10-08",
        rates: rateHistory,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("lets users change a future rate and its effective date", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-08", amountThousands: 700 },
      ],
    })
    try {
      const response = await PUT(
        jsonRequest({ amountThousands: 720, effectiveFrom: "2026-10-12", previousEffectiveFrom: "2026-10-08" }),
      )
      const rateHistory = [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-12", amountThousands: 720 },
      ]

      expect(response.status).toBe(200)
      expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: "calendar.coveredShiftRateThousands" },
        create: { key: "calendar.coveredShiftRateThousands", value: rateHistory },
        update: { value: rateHistory },
      })
      await expect(response.json()).resolves.toMatchObject({
        amountThousands: 685,
        configuredAmountThousands: 720,
        effectiveFrom: "2026-10-12",
        rates: rateHistory,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("allows editing a past period and recalculates it using the revised thousand-COP rate", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-01", amountThousands: 700 },
        { effectiveFrom: "2026-10-15", amountThousands: 720 },
      ],
    })
    try {
      const response = await PUT(
        jsonRequest({ amountThousands: 710, effectiveFrom: "2026-10-02", previousEffectiveFrom: "2026-10-01" }),
      )
      const result = await response.json()
      const updatedHistory = [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-02", amountThousands: 710 },
        { effectiveFrom: "2026-10-15", amountThousands: 720 },
      ]

      expect(response.status).toBe(200)
      expect(result.rates).toEqual(updatedHistory)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-01")).toBe(685)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-02")).toBe(710)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-14")).toBe(710)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-15")).toBe(720)
    } finally {
      vi.useRealTimers()
    }
  })

  it("allows changing the base rate amount without changing its effective date", async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [{ effectiveFrom: "1900-01-01", amountThousands: 685 }],
    })

    const response = await PUT(
      jsonRequest({ amountThousands: 690, effectiveFrom: "1900-01-01", previousEffectiveFrom: "1900-01-01" }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.rates).toEqual([{ effectiveFrom: "1900-01-01", amountThousands: 690 }])
    expect(getCoveredShiftRateForDate(result.rates, "2026-10-06")).toBe(690)
  })

  it("deletes a rate period and falls back to the preceding rate", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-01", amountThousands: 700 },
        { effectiveFrom: "2026-10-15", amountThousands: 720 },
      ],
    })
    try {
      const response = await DELETE(jsonRequest({ effectiveFrom: "2026-10-01" }))
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.rates).toEqual([
        { effectiveFrom: "1900-01-01", amountThousands: 685 },
        { effectiveFrom: "2026-10-15", amountThousands: 720 },
      ])
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-07")).toBe(685)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-15")).toBe(720)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not allow deleting the base rate", async () => {
    const response = await DELETE(jsonRequest({ effectiveFrom: "1900-01-01" }))

    expect(response.status).toBe(400)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })

  it("rejects fractional values beyond thousand-COP precision or negative rates", async () => {
    const fractional = await PUT(jsonRequest({ amountThousands: 685.0001 }))
    const negative = await PUT(jsonRequest({ amountThousands: -1 }))

    expect(fractional.status).toBe(400)
    expect(negative.status).toBe(400)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })
})
