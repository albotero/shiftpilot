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
  it("uses the current COP rate as a default until one is configured", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      amount: 685_000,
      configuredAmount: 685_000,
      rates: [{ effectiveFrom: "1900-01-01", amount: 685_000 }],
    })
  })

  it("converts a legacy scalar rate into an all-history base rate", async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({ value: 720_000 })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      amount: 720_000,
      configuredAmount: 720_000,
      rates: [{ effectiveFrom: "1900-01-01", amount: 720_000 }],
    })
  })

  it("makes a changed rate effective tomorrow and preserves the previous history", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({ value: [{ effectiveFrom: "1900-01-01", amount: 685_000 }] })
    try {
      const response = await PUT(jsonRequest({ amount: 700_000 }))
      const result = await response.json()
      const rateHistory = [
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-08", amount: 700_000 },
      ]

      expect(response.status).toBe(200)
      expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: "calendar.coveredShiftRateCop" },
        create: { key: "calendar.coveredShiftRateCop", value: rateHistory },
        update: { value: rateHistory },
      })
      expect(result).toMatchObject({
        amount: 685_000,
        configuredAmount: 700_000,
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
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-08", amount: 700_000 },
      ],
    })
    try {
      const response = await PUT(
        jsonRequest({ amount: 720_000, effectiveFrom: "2026-10-12", previousEffectiveFrom: "2026-10-08" }),
      )
      const rateHistory = [
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-12", amount: 720_000 },
      ]

      expect(response.status).toBe(200)
      expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
        where: { key: "calendar.coveredShiftRateCop" },
        create: { key: "calendar.coveredShiftRateCop", value: rateHistory },
        update: { value: rateHistory },
      })
      await expect(response.json()).resolves.toMatchObject({
        amount: 685_000,
        configuredAmount: 720_000,
        effectiveFrom: "2026-10-12",
        rates: rateHistory,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("allows editing a past rate period so covered shifts in that period are recalculated", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-01", amount: 700_000 },
        { effectiveFrom: "2026-10-15", amount: 720_000 },
      ],
    })
    try {
      const response = await PUT(
        jsonRequest({ amount: 710_000, effectiveFrom: "2026-10-02", previousEffectiveFrom: "2026-10-01" }),
      )
      const result = await response.json()
      const updatedHistory = [
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-02", amount: 710_000 },
        { effectiveFrom: "2026-10-15", amount: 720_000 },
      ]

      expect(response.status).toBe(200)
      expect(result.rates).toEqual(updatedHistory)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-01")).toBe(685_000)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-02")).toBe(710_000)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-14")).toBe(710_000)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-15")).toBe(720_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it("allows changing the base rate amount without changing its effective date", async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({ value: [{ effectiveFrom: "1900-01-01", amount: 685_000 }] })

    const response = await PUT(
      jsonRequest({ amount: 690_000, effectiveFrom: "1900-01-01", previousEffectiveFrom: "1900-01-01" }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.rates).toEqual([{ effectiveFrom: "1900-01-01", amount: 690_000 }])
    expect(getCoveredShiftRateForDate(result.rates, "2026-10-06")).toBe(690_000)
  })

  it("deletes a rate period and falls back to the preceding rate", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-07T17:00:00.000Z"))
    prismaMock.appSetting.findUnique.mockResolvedValue({
      value: [
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-01", amount: 700_000 },
        { effectiveFrom: "2026-10-15", amount: 720_000 },
      ],
    })
    try {
      const response = await DELETE(jsonRequest({ effectiveFrom: "2026-10-01" }))
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.rates).toEqual([
        { effectiveFrom: "1900-01-01", amount: 685_000 },
        { effectiveFrom: "2026-10-15", amount: 720_000 },
      ])
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-07")).toBe(685_000)
      expect(getCoveredShiftRateForDate(result.rates, "2026-10-15")).toBe(720_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not allow deleting the base rate", async () => {
    const response = await DELETE(jsonRequest({ effectiveFrom: "1900-01-01" }))

    expect(response.status).toBe(400)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })

  it("rejects fractional or negative COP values", async () => {
    const fractional = await PUT(jsonRequest({ amount: 685_000.5 }))
    const negative = await PUT(jsonRequest({ amount: -1 }))

    expect(fractional.status).toBe(400)
    expect(negative.status).toBe(400)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })
})
