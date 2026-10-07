import { describe, expect, it } from "vitest"
import { buildMonthlyReport } from "./monthly"

describe("monthly reports", () => {
  it("summarizes work, night shifts, coverages, and money without invoice collection states", () => {
    expect(
      buildMonthlyReport({
        month: "2026-10",
        shifts: [
          { status: "TURNO", period: "AM", durationHours: 6, coverageCount: 0 },
          { status: "NOCHE", period: "NOCHE", durationHours: 12, coverageCount: 1 },
          { status: "LIBRE", period: "PM", durationHours: 6, coverageCount: 0 },
          { status: "TURNO_OTRA_PERSONA", period: "PM", durationHours: 6, coverageCount: 0 },
        ],
        invoices: [{ netAmount: 800 }, { netAmount: 125.5 }],
        socialSecurity: {
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
        },
        debtSchedule: [{ paymentAmount: 1000 }],
        debtPayments: [{ amount: 500, parkingAmount: 150 }],
      }),
    ).toEqual({
      month: "2026-10",
      work: { shiftCount: 3, hours: 18, coveredShiftCount: 2, coveredHours: 18, coverageAssignments: 2 },
      billing: { invoiceCount: 2, registeredNetAmount: 925.5 },
      socialSecurity: {
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
      },
      debt: {
        scheduledInstallments: 1,
        scheduledAmount: 1000,
        paymentCount: 1,
        paidAmount: 500,
        parkingAmount: 150,
      },
    })
  })

  it("returns no calculated social security or debt section when none exists", () => {
    expect(
      buildMonthlyReport({
        month: "2026-10",
        shifts: [],
        invoices: [],
        socialSecurity: null,
        debtSchedule: [],
        debtPayments: [],
      }),
    ).toMatchObject({
      work: { shiftCount: 0, hours: 0, coveredShiftCount: 0, coveredHours: 0, coverageAssignments: 0 },
      billing: { invoiceCount: 0, registeredNetAmount: 0 },
      socialSecurity: null,
      debt: null,
    })
  })
})
