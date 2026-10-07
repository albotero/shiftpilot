import { describe, expect, it } from "vitest"
import {
  calculateParticularInvoice,
  calculatePosInvoice,
  calculatePrepaidInvoice,
  calculateSedarteInvoice,
} from "@/lib/billing/calculations"
import { calculateDebtSummary, calculatePaymentAllocationsByPayment } from "@/lib/debt/calculations"
import { getDebtPlanSnapshot } from "@/lib/debt/plan-snapshot"
import {
  calculateIbc,
  calculateSocialSecurity,
  getCalculatedSocialSecurityRates,
  getSocialSecurityConfiguration,
  getSolidarityRatePpm,
  DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
  DEFAULT_SOCIAL_SECURITY_RATES,
} from "@/lib/social-security/calculations"
import { assertMoneyAmount, percentageOf, roundUpPercentageToScale } from "@/lib/money/integer"
import { formatMoneyInput, parseMoneyInput } from "@/lib/money/input-format"
import { initialDebtSchedule } from "../../prisma/debt-schedule"

describe("localized money input", () => {
  it("formats thousands with periods and decimal fractions with commas", () => {
    expect(formatMoneyInput("1234567.89")).toBe("1.234.567,89")
    expect(formatMoneyInput("1750.905")).toBe("1.750,905")
  })

  it("parses localized values back to dot-decimal amounts", () => {
    expect(parseMoneyInput("1.234.567,89")).toBe("1234567.89")
    expect(parseMoneyInput("1.750,905")).toBe("1750.905")
    expect(parseMoneyInput("1234,5")).toBe("1234.5")
    expect(parseMoneyInput("1.234,", true)).toBe("1234")
  })
})

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
      healthAmount: 125,
      pensionAmount: 160,
      arlAmount: 24.4,
      fundAmount: 0,
      solidarityAmount: 0,
      totalAmount: 309.4,
    })
  })

  it("preserves whole-peso precision in amounts expressed as thousands of COP", () => {
    assertMoneyAmount(47_445.123)
    expect(calculateIbc(47_445.123)).toBe(18_978.049)
    expect(percentageOf(47_445.123, 120_000)).toBe(5_693.415)
    expect(() => assertMoneyAmount(47_445.1234)).toThrow(/three decimals/i)
  })

  it("rounds contributions upward immediately across a tenth-thousand boundary", () => {
    expect(roundUpPercentageToScale(7.999, 125_000, 10)).toBe(10)
    expect(roundUpPercentageToScale(8, 125_000, 10)).toBe(10)
    expect(roundUpPercentageToScale(8.001, 125_000, 10)).toBe(11)
  })

  it("applies the same before/on/after upward boundary to every contribution", () => {
    const sameRateForEachComponent = {
      ...DEFAULT_SOCIAL_SECURITY_RATES,
      healthRatePpm: 125_000,
      pensionRatePpm: 125_000,
      arlRatePpm: 125_000,
      fundRatePpm: 125_000,
      solidarityRatePpm: 125_000,
    }

    for (const [ibc, expectedTenths] of [
      [7.999, 10],
      [8, 10],
      [8.001, 11],
    ] as const) {
      const result = calculateSocialSecurity(ibc, sameRateForEachComponent)
      expect(result.healthAmount).toBe(expectedTenths / 10)
      expect(result.pensionAmount).toBe(expectedTenths / 10)
      expect(result.arlAmount).toBe(expectedTenths / 10)
      expect(result.fundAmount).toBe(expectedTenths / 10)
      expect(result.solidarityAmount).toBe(expectedTenths / 10)
      expect(result.totalAmount).toBe(expectedTenths / 2)
    }
  })

  it("calculates solidarity progressively from four minimum wages only when pension is paid", () => {
    const minimumWage = 1_750.905
    const thresholds = [4, 16, 17, 18, 19, 20].map((multiple) =>
      getSolidarityRatePpm(minimumWage * multiple, minimumWage, true),
    )

    expect(thresholds).toEqual([10_000, 12_000, 14_000, 16_000, 18_000, 20_000])
    expect(getSolidarityRatePpm(minimumWage * 4 - 0.001, minimumWage, true)).toBe(0)
    expect(getSolidarityRatePpm(minimumWage * 20, minimumWage, false)).toBe(0)
  })

  it("derives pension, ARL class, and voluntary compensation fund rates from options", () => {
    expect(
      getCalculatedSocialSecurityRates(
        { pensionEnabled: false, arlEnabled: true, arlRiskClass: "V", compensationFundEnabled: true },
        100_000,
        1_750.905,
      ),
    ).toEqual({
      ...DEFAULT_SOCIAL_SECURITY_RATES,
      pensionRatePpm: 0,
      arlRatePpm: 69_600,
      fundRatePpm: 20_000,
      solidarityRatePpm: 0,
    })
    expect(DEFAULT_SOCIAL_SECURITY_CONFIGURATION.compensationFundEnabled).toBe(false)
  })

  it("does not reinterpret the legacy solidarity percentage as compensation fund enrollment", () => {
    expect(
      getSocialSecurityConfiguration([
        { key: "socialSecurity.pensionRatePpm", value: 160_000 },
        { key: "socialSecurity.arlRatePpm", value: 24_360 },
        { key: "socialSecurity.fundRatePpm", value: 10_000 },
      ]),
    ).toEqual({
      pensionEnabled: true,
      arlEnabled: true,
      arlRiskClass: "III",
      compensationFundEnabled: false,
    })
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
      principalTotal: 1000,
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

  it("keeps each installment allocation linked to the real payment that funded it", () => {
    expect(
      calculatePaymentAllocationsByPayment(schedule, [
        { id: "payment-first", paidAt: "2024-05-05", amount: 500, parkingAmount: 150 },
        { id: "payment-second", paidAt: "2024-06-05", amount: 1000, parkingAmount: 0 },
      ]),
    ).toEqual([
      {
        paymentId: "payment-first",
        installment: 1,
        principalAmount: 400,
        interestAmount: 100,
        unclassifiedAmount: 0,
        balanceAfterAmount: 600,
      },
      {
        paymentId: "payment-second",
        installment: 1,
        principalAmount: 500,
        interestAmount: 0,
        unclassifiedAmount: 0,
        balanceAfterAmount: 0,
      },
      {
        paymentId: "payment-second",
        installment: 2,
        principalAmount: 420,
        interestAmount: 80,
        unclassifiedAmount: 0,
        balanceAfterAmount: 0,
      },
    ])
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

  it("keeps the final row's unclassified amount on its payment allocation", () => {
    const [month, previousBalance, monthlyInterest, paymentAmount, interestAmount, principalAmount, remainingBalance] =
      initialDebtSchedule[71]

    expect(
      calculatePaymentAllocationsByPayment(
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
        [{ id: "final-payment", paidAt: `${month}-11`, amount: paymentAmount, parkingAmount: 0 }],
      ),
    ).toEqual([
      {
        paymentId: "final-payment",
        installment: 72,
        principalAmount: 14_822,
        interestAmount: 95,
        unclassifiedAmount: 1,
        balanceAfterAmount: 0,
      },
    ])
  })

  it("shows the balance before October 2026's planned installment", () => {
    expect(getDebtPlanSnapshot("2026-10")).toEqual({
      balanceAtMonthStart: 560362,
      nextInstallment: {
        installment: 30,
        month: "2026-10",
        amount: 12031,
        principalAmount: 8426,
        interestAmount: 3605,
      },
    })
  })
})
