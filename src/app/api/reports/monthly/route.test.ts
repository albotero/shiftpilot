import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  shift: { findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
  socialSecurityPeriod: { findUnique: vi.fn() },
  debt: { findUnique: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { GET } from "./route"

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.shift.findMany.mockResolvedValue([
    { status: "TURNO", period: "AM", durationHours: 6, coverages: [] },
    { status: "NOCHE", period: "NOCHE", durationHours: 12, coverages: [{ id: "coverage-1" }] },
  ])
  prismaMock.invoice.findMany.mockResolvedValue([{ netAmount: 800 }, { netAmount: 125.5 }])
  prismaMock.socialSecurityPeriod.findUnique.mockResolvedValue({
    grossAmount: 925.5,
    discounts: 0,
    netAmount: 925.5,
    ibcAmount: 1_750.905,
    healthAmount: 218.9,
    pensionAmount: 280.2,
    arlAmount: 42.7,
    fundAmount: 0,
    solidarityAmount: 0,
    totalAmount: 541.8,
  })
  prismaMock.debt.findUnique.mockResolvedValue({
    schedule: [{ paymentAmount: 1000 }],
    payments: [{ amount: 500, parkingAmount: 150 }],
  })
})

describe("monthly reports route", () => {
  it("aggregates registered invoices and monthly finance data without collection-state filters", async () => {
    const response = await GET(new Request("http://localhost/api/reports/monthly?month=2026-10"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      month: "2026-10",
      work: { shiftCount: 3, hours: 18, coveredShiftCount: 1, coveredHours: 12, coverageAssignments: 1 },
      billing: { invoiceCount: 2, registeredNetAmount: 925.5 },
      socialSecurity: { ibcAmount: 1_750.905, totalAmount: 541.8 },
      debt: { scheduledInstallments: 1, scheduledAmount: 1000, paymentCount: 1, paidAmount: 500, parkingAmount: 150 },
    })
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: {
        serviceDate: {
          gte: new Date("2026-10-01T00:00:00.000Z"),
          lt: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
      select: { netAmount: true },
    })
  })

  it("rejects invalid months before querying report sources", async () => {
    const response = await GET(new Request("http://localhost/api/reports/monthly?month=2026-13"))

    expect(response.status).toBe(400)
    expect(prismaMock.shift.findMany).not.toHaveBeenCalled()
    expect(prismaMock.invoice.findMany).not.toHaveBeenCalled()
    expect(prismaMock.socialSecurityPeriod.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.debt.findUnique).not.toHaveBeenCalled()
  })
})
