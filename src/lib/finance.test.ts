import { describe, expect, it } from "vitest"
import {
  calculateParticularInvoice,
  calculatePosInvoice,
  calculatePrepaidInvoice,
  calculateSedarteInvoice,
} from "@/lib/billing/calculations"
import { calculateDebtSummary } from "@/lib/debt/calculations"
import { getDebtPlanSnapshot } from "@/lib/debt/plan-snapshot"
import { calculateIbc, calculateSocialSecurity } from "@/lib/social-security/calculations"
import { assertMoneyAmount, percentageOf } from "@/lib/money/integer"
import { initialDebtSchedule } from "../../prisma/debt-schedule"

describe("billing calculations in thousands of COP", () => {
  it("keeps the POS day discount separate from the editable shift discount", () => {
    expect(calculatePosInvoice(1000, 50)).toMatchObject({
      discountAmount: 120,
      shiftDiscountAmount: 50,
      netAmount: 830,
    })
  })

  it("applies the prepaid discount", () => {
    expect(calculatePrepaidInvoice(1000).netAmount).toBe(800)
  })

  it("keeps private shifts separate and excludes them from the 12% discount", () => {
    expect(calculateParticularInvoice(1000, 2)).toMatchObject({
      discountAmount: 120,
      privateShiftAmount: 1370,
      netAmount: 2250,
    })
  })

  it("does not discount Sedarte", () => {
    expect(calculateSedarteInvoice(1000).netAmount).toBe(1000)
  })

  it("preserves peso fractions through billing percentages and discounts", () => {
    expect(calculatePosInvoice(1234.567, 0.001)).toMatchObject({
      grossAmount: 1234.567,
      discountAmount: 148.148,
      shiftDiscountAmount: 0.001,
      netAmount: 1086.418,
    })
  })
})

describe("social security calculations", () => {
  it("calculates a 40% IBC without dropping pesos", () => {
    expect(calculateIbc(1000)).toBe(400)
    expect(calculateIbc(1001)).toBe(400.4)
  })

  it("rounds each contribution upward to one decimal in thousands of COP", () => {
    expect(calculateSocialSecurity(1000)).toMatchObject({
      healthAmountTenths: 1250,
      pensionAmountTenths: 1600,
      arlAmountTenths: 244,
      fundAmountTenths: 100,
      totalAmountTenths: 3194,
    })
  })

  it("preserves whole-peso precision in amounts expressed as thousands of COP", () => {
    assertMoneyAmount(47_445.123)
    expect(calculateIbc(47_445.123)).toBe(18_978.049)
    expect(percentageOf(47_445.123, 120_000)).toBe(5_693.415)
    expect(() => assertMoneyAmount(47_445.1234)).toThrow(/three decimals/i)
  })
})

describe("fixed debt schedule", () => {
  const schedule = [
    {
      installment: 1,
      dueDate: "2024-05-01",
      previousBalance: 1000,
      monthlyInterest: 100,
      principalAmount: 900,
      interestAmount: 100,
      paymentAmount: 1000,
      remainingBalance: 100,
    },
    {
      installment: 2,
      dueDate: "2024-06-01",
      previousBalance: 100,
      monthlyInterest: 80,
      principalAmount: 920,
      interestAmount: 80,
      paymentAmount: 1000,
      remainingBalance: 0,
    },
  ]

  it("excludes parking and never adds late interest to an overdue payment", () => {
    const result = calculateDebtSummary(
      schedule,
      [{ paidAt: "2026-07-11", amount: 500, parkingAmount: 150 }],
      "2026-10-05",
    )

    expect(result).toMatchObject({
      scheduledAmount: 2000,
      balanceAmount: 1500,
      interestPaid: 100,
      principalPaid: 400,
      paymentsApplied: 500,
      parkingPaid: 150,
      pendingInstallments: [1, 2],
      nextInstallment: 1,
    })
  })

  it("preserves peso fractions when allocating debt payments", () => {
    const result = calculateDebtSummary(
      [
        {
          installment: 1,
          dueDate: "2026-09-01",
          previousBalance: 2.001,
          monthlyInterest: 0.001,
          paymentAmount: 2.001,
          interestAmount: 0.001,
          principalAmount: 2,
          remainingBalance: 0,
        },
      ],
      [{ paidAt: "2026-09-10", amount: 1.001, parkingAmount: 0.001 }],
      "2026-10-05",
    )

    expect(result).toMatchObject({
      scheduledAmount: 2.001,
      balanceAmount: 1,
      interestPaid: 0.001,
      principalPaid: 1,
      paymentsApplied: 1.001,
      parkingPaid: 0.001,
    })
  })

  it("preserves all 72 source installments and their stated amounts", () => {
    expect(initialDebtSchedule).toHaveLength(72)
    expect(initialDebtSchedule[0]).toEqual(["2024-05", 721218, 4640, 7000, 4640, 2360, 718858])
    expect(initialDebtSchedule[71]).toEqual(["2030-04", 14822, 95, 14918, 95, 14822, 0])

    for (const row of initialDebtSchedule) {
      expect(row[2]).toBe(row[4])
    }
    const sourceDifferences = initialDebtSchedule.filter((row) => row[3] !== row[4] + row[5])
    expect(sourceDifferences).toEqual([initialDebtSchedule[71]])
    initialDebtSchedule.forEach(([month], index) => {
      expect(month).toBe(new Date(Date.UTC(2024, 4 + index, 1)).toISOString().slice(0, 7))
    })
  })

  it("keeps the final row's unclassified thousand separate from principal and interest", () => {
    const [month, previousBalance, monthlyInterest, paymentAmount, interestAmount, principalAmount, remainingBalance] =
      initialDebtSchedule[71]
    const result = calculateDebtSummary(
      [
        {
          installment: 72,
          dueDate: `${month}-01`,
          previousBalance,
          monthlyInterest,
          paymentAmount,
          interestAmount,
          principalAmount,
          remainingBalance,
        },
      ],
      [{ paidAt: "2030-04-11", amount: paymentAmount, parkingAmount: 0 }],
      "2030-04-30",
    )

    expect(result).toMatchObject({
      balanceAmount: 0,
      interestPaid: 95,
      principalPaid: 14822,
      unclassifiedPaid: 1,
      scheduleDifference: 1,
    })
  })

  it("shows the balance before October 2026's planned installment", () => {
    expect(getDebtPlanSnapshot("2026-10")).toEqual({
      balanceAtMonthStart: 560362,
      nextInstallment: {
        month: "2026-10",
        amount: 12031,
        principalAmount: 8426,
        interestAmount: 3605,
      },
    })
  })
})
