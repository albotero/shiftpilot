import { describe, expect, it, vi } from "vitest"
import { DEFAULT_SOCIAL_SECURITY_CONFIGURATION } from "./calculations"
import type { MinimumWageSnapshot } from "./minimum-wage"
import { calculateSocialSecurityPeriod, recalculateSocialSecurityPeriod } from "./period"
import type { SocialSecurityPeriodDatabase } from "./period"

const minimumWage: MinimumWageSnapshot = {
  year: 2026,
  sourceYear: 2026,
  amountCop: 1_750_905,
  sourceUrl: "https://www.mintrabajo.gov.co/official-2026",
  stale: false,
}

describe("monthly social security period", () => {
  it("uses final invoice net amounts after discounts and rounds each component", () => {
    const period = calculateSocialSecurityPeriod(
      [
        {
          grossAmount: 47_445.123,
          discountAmount: 16_824.665,
          shiftDiscountAmount: 0,
          netAmount: 30_620.458,
        },
      ],
      DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
      0,
      minimumWage.amountCop,
    )

    expect(period).toEqual({
      grossAmount: 47_445.123,
      discounts: 16_824.665,
      netAmount: 30_620.458,
      ibcAmount: 12_248.183,
      configuration: DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
      rates: {
        ibcRatePpm: 400_000,
        healthRatePpm: 125_000,
        pensionRatePpm: 160_000,
        arlRatePpm: 24_360,
        fundRatePpm: 0,
        solidarityRatePpm: 10_000,
      },
      healthAmountTenths: 15_311,
      pensionAmountTenths: 19_598,
      arlAmountTenths: 2_984,
      fundAmountTenths: 0,
      solidarityAmountTenths: 1_225,
      totalAmountTenths: 39_118,
    })
  })

  it("applies the SMMLV floor to a month without invoices", () => {
    expect(
      calculateSocialSecurityPeriod([], DEFAULT_SOCIAL_SECURITY_CONFIGURATION, 1_750.905, minimumWage.amountCop),
    ).toEqual({
      grossAmount: 0,
      discounts: 0,
      netAmount: 0,
      ibcAmount: 1_750.905,
      configuration: DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
      rates: expect.objectContaining({ solidarityRatePpm: 0 }),
      healthAmountTenths: 2_189,
      pensionAmountTenths: 2_802,
      arlAmountTenths: 427,
      fundAmountTenths: 0,
      solidarityAmountTenths: 0,
      totalAmountTenths: 5_418,
    })
  })

  it("uses one Colombian minimum wage as the IBC floor when 40% of net is lower", () => {
    const period = calculateSocialSecurityPeriod(
      [{ grossAmount: 800, discountAmount: 0, shiftDiscountAmount: 0, netAmount: 800 }],
      DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
      1_750.905,
      minimumWage.amountCop,
    )

    expect(period).toMatchObject({ netAmount: 800, ibcAmount: 1_750.905 })
    expect(
      calculateSocialSecurityPeriod([], DEFAULT_SOCIAL_SECURITY_CONFIGURATION, 1_750.905, minimumWage.amountCop)
        .ibcAmount,
    ).toBe(1_750.905)
  })

  it("persists exactly one configured period for the requested month on every recalculation", async () => {
    const database = {
      invoice: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ grossAmount: 1000, discountAmount: 100, shiftDiscountAmount: 0, netAmount: 900 }]),
      },
      appSetting: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ key: "socialSecurity.configuration", value: DEFAULT_SOCIAL_SECURITY_CONFIGURATION }]),
      },
      socialSecurityPeriod: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(async ({ where, create, update }) => ({
          id: "period-september",
          ...create,
          ...update,
          month: where.month,
        })),
      },
    } as unknown as SocialSecurityPeriodDatabase

    const first = await recalculateSocialSecurityPeriod(database, "2026-09", minimumWage)
    const second = await recalculateSocialSecurityPeriod(database, "2026-09", minimumWage)

    expect(database.invoice.findMany).toHaveBeenCalledWith({
      where: {
        serviceDate: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lt: new Date("2026-10-01T00:00:00.000Z"),
        },
      },
      select: { grossAmount: true, discountAmount: true, shiftDiscountAmount: true, netAmount: true },
    })
    expect(database.socialSecurityPeriod.upsert).toHaveBeenCalledTimes(2)
    expect(database.socialSecurityPeriod.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          minimumWageCop: minimumWage.amountCop,
          minimumWageSourceYear: minimumWage.sourceYear,
          minimumWageSourceUrl: minimumWage.sourceUrl,
          pensionEnabled: true,
          arlRiskClass: "III",
          compensationFundEnabled: false,
          healthRatePpm: 125_000,
          pensionRatePpm: 160_000,
          solidarityRatePpm: 0,
        }),
      }),
    )
    expect(first.rates.ibcRatePpm).toBe(400_000)
    expect(first.period).toEqual(second.period)
    expect(first.period).toMatchObject({
      grossAmount: 1000,
      discounts: 100,
      netAmount: 900,
      ibcAmount: 1_750.905,
    })
  })

  it("keeps a saved month's minimum wage and contribution configuration when annual settings change", async () => {
    const savedConfiguration = {
      pensionEnabled: true,
      arlEnabled: true,
      arlRiskClass: "III" as const,
      compensationFundEnabled: false,
    }
    const database = {
      invoice: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ grossAmount: 800, discountAmount: 0, shiftDiscountAmount: 0, netAmount: 800 }]),
      },
      appSetting: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "socialSecurity.configuration",
            value: {
              pensionEnabled: false,
              arlEnabled: true,
              arlRiskClass: "V",
              compensationFundEnabled: true,
            },
          },
        ]),
      },
      socialSecurityPeriod: {
        findUnique: vi.fn().mockResolvedValue({
          minimumWageCop: 1_750_905,
          minimumWageSourceYear: 2026,
          minimumWageSourceUrl: "https://www.mintrabajo.gov.co/official-2026",
          minimumWageStale: false,
          ibcRatePpm: 400_000,
          healthRatePpm: 130_000,
          pensionRatePpm: 150_000,
          arlRatePpm: 24_360,
          fundRatePpm: 0,
          ...savedConfiguration,
        }),
        upsert: vi.fn(async ({ where, create, update }) => ({
          id: "period-december",
          ...create,
          ...update,
          month: where.month,
        })),
      },
    } as unknown as SocialSecurityPeriodDatabase
    const nextYearWage: MinimumWageSnapshot = {
      year: 2027,
      sourceYear: 2027,
      amountCop: 2_000_000,
      sourceUrl: "https://www.mintrabajo.gov.co/official-2027",
      stale: false,
    }

    const result = await recalculateSocialSecurityPeriod(database, "2026-12", nextYearWage)

    expect(result.minimumWage).toEqual({
      year: 2026,
      sourceYear: 2026,
      amountCop: 1_750_905,
      sourceUrl: "https://www.mintrabajo.gov.co/official-2026",
      stale: false,
    })
    expect(result.configuration).toEqual(savedConfiguration)
    expect(result.period.ibcAmount).toBe(1_750.905)
    expect(result.rates.healthRatePpm).toBe(130_000)
    expect(result.rates.pensionRatePpm).toBe(150_000)
    expect(result.rates.arlRatePpm).toBe(24_360)
    expect(result.rates.fundRatePpm).toBe(0)
    expect(database.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          minimumWageCop: 1_750_905,
          pensionEnabled: true,
          arlRiskClass: "III",
          compensationFundEnabled: false,
        }),
      }),
    )
  })
})
