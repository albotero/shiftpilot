import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn() },
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
    socialSecurityPeriod: { upsert: vi.fn() },
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock.prisma }))

import { GET, PATCH } from "./route"

const rates = [
  { key: "socialSecurity.ibcRatePpm", value: 500_000 },
  { key: "socialSecurity.healthRatePpm", value: 125_000 },
  { key: "socialSecurity.pensionRatePpm", value: 160_000 },
  { key: "socialSecurity.arlRatePpm", value: 24_360 },
  { key: "socialSecurity.fundRatePpm", value: 10_000 },
  {
    key: "socialSecurity.minimumWageCop.2026",
    value: {
      year: 2026,
      amountCop: 1_750_905,
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
  prismaMock.prisma.appSetting.findMany.mockResolvedValue(rates)
  prismaMock.prisma.socialSecurityPeriod.upsert.mockImplementation(async ({ where, create, update }) => ({
    id: "period",
    ...create,
    ...update,
    month: where.month,
  }))
  prismaMock.prisma.appSetting.upsert.mockResolvedValue({})
})

describe("social-security routes", () => {
  it("calculates and persists one monthly period using configured rates", async () => {
    const response = await GET(new Request("http://localhost/api/social-security?month=2026-09"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      month: "2026-09",
      rates: { ibcRatePpm: 500_000 },
      period: {
        grossAmount: 47_445.123,
        discounts: 16_824.665,
        netAmount: 30_620.458,
        ibcAmount: 15_310.229,
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
      healthAmountTenths: 2_189,
      pensionAmountTenths: 2_802,
      arlAmountTenths: 427,
      fundAmountTenths: 176,
      totalAmountTenths: 5_594,
    })
  })

  it("saves configurable rates and recalculates the selected month", async () => {
    const response = await PATCH(
      jsonRequest({
        month: "2026-10",
        rates: {
          ...Object.fromEntries(rates.map(({ key, value }) => [key.split(".").at(-1), value])),
          healthRatePpm: 130_000,
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.appSetting.upsert).toHaveBeenCalledTimes(5)
    expect(prismaMock.prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "socialSecurity.healthRatePpm" },
      create: { key: "socialSecurity.healthRatePpm", value: 130_000 },
      update: { value: 130_000 },
    })
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { month: new Date("2026-10-01T00:00:00.000Z") } }),
    )
  })

  it("rejects invalid months before querying invoices", async () => {
    const response = await GET(new Request("http://localhost/api/social-security?month=2026-13"))

    expect(response.status).toBe(400)
    expect(prismaMock.prisma.invoice.findMany).not.toHaveBeenCalled()
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).not.toHaveBeenCalled()
  })
})
