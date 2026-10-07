import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn() },
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
    socialSecurityPeriod: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock.prisma }))

import { GET, PATCH } from "./route"

const settings = [
  {
    key: "socialSecurity.configuration",
    value: { pensionEnabled: true, arlEnabled: true, arlRiskClass: "III", compensationFundEnabled: false },
  },
  {
    key: "socialSecurity.minimumWageAmount.2026",
    value: {
      year: 2026,
      amount: 1_750.905,
      sourceUrl: "https://www.mintrabajo.gov.co/test-2026",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
]

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/social-security", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.prisma.$transaction.mockImplementation(
    async (operation: (transaction: typeof prismaMock.prisma) => Promise<unknown>) => operation(prismaMock.prisma),
  )
  prismaMock.prisma.invoice.findMany.mockResolvedValue([
    { grossAmount: 47_445.123, discountAmount: 16_824.665, shiftDiscountAmount: 0, netAmount: 30_620.458 },
  ])
  prismaMock.prisma.appSetting.findMany.mockResolvedValue(settings)
  prismaMock.prisma.socialSecurityPeriod.findUnique.mockResolvedValue(null)
  prismaMock.prisma.socialSecurityPeriod.upsert.mockImplementation(async ({ where, create, update }) => ({
    id: "period",
    ...create,
    ...update,
    month: where.month,
  }))
  prismaMock.prisma.appSetting.upsert.mockResolvedValue({})
})

describe("social-security routes", () => {
  it("calculates and persists one monthly period using derived configuration rates", async () => {
    const response = await GET(new Request("http://localhost/api/social-security?month=2026-09"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      month: "2026-09",
      configuration: { pensionEnabled: true, arlEnabled: true, arlRiskClass: "III", compensationFundEnabled: false },
      rates: {
        ibcRatePpm: 400_000,
        healthRatePpm: 125_000,
        pensionRatePpm: 160_000,
        arlRatePpm: 24_360,
        fundRatePpm: 0,
        solidarityRatePpm: 10_000,
      },
      period: {
        grossAmount: 47_445.123,
        discounts: 16_824.665,
        netAmount: 30_620.458,
        ibcAmount: 12_248.183,
        solidarityAmount: 122.5,
      },
    })
    expect(prismaMock.prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceDate: {
            gte: new Date("2026-09-01T00:00:00.000Z"),
            lt: new Date("2026-10-01T00:00:00.000Z"),
          },
        },
      }),
    )
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { month: new Date("2026-09-01T00:00:00.000Z") } }),
    )
  })

  it("applies the cached SMMLV floor when the requested month has no invoices", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([])

    const response = await GET(new Request("http://localhost/api/social-security?month=2026-10"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.period).toMatchObject({
      grossAmount: 0,
      discounts: 0,
      netAmount: 0,
      ibcAmount: 1_750.905,
      healthAmount: 218.9,
      pensionAmount: 280.2,
      arlAmount: 42.7,
      fundAmount: 0,
      solidarityAmount: 0,
      totalAmount: 541.8,
    })
  })

  it("uses the saved monthly SMMLV snapshot instead of resolving a newer annual value", async () => {
    const savedPeriod = {
      minimumWageAmount: 1_750.905,
      minimumWageSourceYear: 2026,
      minimumWageSourceUrl: "https://www.mintrabajo.gov.co/saved-2026",
      minimumWageStale: false,
    }
    prismaMock.prisma.socialSecurityPeriod.findUnique
      .mockResolvedValueOnce(savedPeriod)
      .mockResolvedValueOnce(savedPeriod)

    const response = await GET(new Request("http://localhost/api/social-security?month=2026-12"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.minimumWage).toEqual({
      year: 2026,
      sourceYear: 2026,
      amount: 1_750.905,
      sourceUrl: "https://www.mintrabajo.gov.co/saved-2026",
      stale: false,
    })
  })

  it("saves contribution options and recalculates the selected month", async () => {
    const response = await PATCH(
      jsonRequest({
        month: "2026-10",
        configuration: {
          pensionEnabled: false,
          arlEnabled: true,
          arlRiskClass: "V",
          compensationFundEnabled: true,
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.appSetting.upsert).not.toHaveBeenCalled()
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { month: new Date("2026-10-01T00:00:00.000Z") },
        update: expect.objectContaining({
          pensionEnabled: false,
          arlEnabled: true,
          arlRiskClass: "V",
          compensationFundEnabled: true,
        }),
      }),
    )
  })

  it("rejects invalid months before querying invoices", async () => {
    const response = await GET(new Request("http://localhost/api/social-security?month=2026-13"))

    expect(response.status).toBe(400)
    expect(prismaMock.prisma.invoice.findMany).not.toHaveBeenCalled()
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).not.toHaveBeenCalled()
  })
})
