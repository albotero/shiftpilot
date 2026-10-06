import { addMoney, maxMoney, roundMoneyAmount } from "@/lib/money/integer"
import type { Prisma } from "@prisma/client"
import {
  calculateSocialSecurity,
  DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
  getCalculatedSocialSecurityRates,
  getSocialSecurityConfiguration,
  type ArlRiskClass,
  type SocialSecurityConfiguration,
  type SocialSecurityRates,
} from "./calculations"
import type { MinimumWageSnapshot } from "./minimum-wage"

export type InvoiceMonthlyAmounts = {
  grossAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  netAmount: number
}

export type SocialSecurityPeriodDatabase = Pick<
  Prisma.TransactionClient,
  "invoice" | "appSetting" | "socialSecurityPeriod"
>

function getMonthStart(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError("Mes inválido")
  const [year, monthNumber] = month.split("-").map(Number)
  if (year < 1900 || year > 9998 || monthNumber < 1 || monthNumber > 12) throw new RangeError("Mes inválido")
  return new Date(Date.UTC(year, monthNumber - 1, 1))
}

export function calculateSocialSecurityPeriod(
  invoices: InvoiceMonthlyAmounts[],
  configuration: SocialSecurityConfiguration = DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
  minimumIbcAmount = 0,
  minimumWageCop = 0,
  ratesOverride: Partial<SocialSecurityRates> = {},
) {
  const grossAmount = addMoney(...invoices.map((invoice) => invoice.grossAmount))
  const discounts = addMoney(...invoices.flatMap((invoice) => [invoice.discountAmount, invoice.shiftDiscountAmount]))
  const netAmount = addMoney(...invoices.map((invoice) => invoice.netAmount))
  const ibcPercentage = roundMoneyAmount(netAmount * 0.4)
  const ibcAmount = maxMoney(ibcPercentage, minimumIbcAmount)
  const calculatedRates = getCalculatedSocialSecurityRates(configuration, ibcAmount, minimumWageCop)
  const rates = { ...calculatedRates, ...ratesOverride, solidarityRatePpm: calculatedRates.solidarityRatePpm }
  const contributions = calculateSocialSecurity(ibcAmount, rates)

  return {
    grossAmount,
    discounts,
    netAmount,
    ibcAmount,
    configuration,
    rates,
    healthAmountTenths: contributions.healthAmountTenths,
    pensionAmountTenths: contributions.pensionAmountTenths,
    arlAmountTenths: contributions.arlAmountTenths,
    fundAmountTenths: contributions.fundAmountTenths,
    solidarityAmountTenths: contributions.solidarityAmountTenths,
    totalAmountTenths: contributions.totalAmountTenths,
  }
}

export async function recalculateSocialSecurityPeriod(
  database: SocialSecurityPeriodDatabase,
  month: string,
  minimumWage: MinimumWageSnapshot,
  configurationOverride?: SocialSecurityConfiguration,
) {
  const monthStart = getMonthStart(month)
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const [invoices, settingRecords, existingPeriod] = await Promise.all([
    database.invoice.findMany({
      where: { serviceDate: { gte: monthStart, lt: nextMonth } },
      select: { grossAmount: true, discountAmount: true, shiftDiscountAmount: true, netAmount: true },
    }),
    database.appSetting.findMany({ where: { key: { startsWith: "socialSecurity." } } }),
    database.socialSecurityPeriod.findUnique({ where: { month: monthStart } }),
  ])
  const savedRiskClass = existingPeriod?.arlRiskClass
  const hasSavedConfiguration =
    typeof existingPeriod?.pensionEnabled === "boolean" &&
    typeof existingPeriod.arlEnabled === "boolean" &&
    typeof savedRiskClass === "string" &&
    ["I", "II", "III", "IV", "V"].includes(savedRiskClass) &&
    typeof existingPeriod.compensationFundEnabled === "boolean"
  const configuration =
    configurationOverride ??
    (hasSavedConfiguration
      ? {
          pensionEnabled: existingPeriod.pensionEnabled as boolean,
          arlEnabled: existingPeriod.arlEnabled as boolean,
          arlRiskClass: savedRiskClass as ArlRiskClass,
          compensationFundEnabled: existingPeriod.compensationFundEnabled as boolean,
        }
      : getSocialSecurityConfiguration(settingRecords))
  const savedMinimumWage = existingPeriod?.minimumWageCop
  const periodMinimumWage: MinimumWageSnapshot =
    typeof savedMinimumWage === "number" && existingPeriod
      ? {
          year: monthStart.getUTCFullYear(),
          sourceYear: existingPeriod.minimumWageSourceYear ?? monthStart.getUTCFullYear(),
          amountCop: savedMinimumWage,
          sourceUrl: existingPeriod.minimumWageSourceUrl ?? minimumWage.sourceUrl,
          stale: existingPeriod.minimumWageStale ?? false,
        }
      : minimumWage
  const savedRates: Partial<SocialSecurityRates> = {}
  if (!configurationOverride && existingPeriod) {
    if (typeof existingPeriod.ibcRatePpm === "number") savedRates.ibcRatePpm = existingPeriod.ibcRatePpm
    if (typeof existingPeriod.healthRatePpm === "number") savedRates.healthRatePpm = existingPeriod.healthRatePpm
    if (typeof existingPeriod.pensionRatePpm === "number") savedRates.pensionRatePpm = existingPeriod.pensionRatePpm
    if (typeof existingPeriod.arlRatePpm === "number") savedRates.arlRatePpm = existingPeriod.arlRatePpm
    if (typeof existingPeriod.fundRatePpm === "number") savedRates.fundRatePpm = existingPeriod.fundRatePpm
  }
  const calculated = calculateSocialSecurityPeriod(
    invoices.map((invoice) => ({
      grossAmount: Number(invoice.grossAmount),
      discountAmount: Number(invoice.discountAmount),
      shiftDiscountAmount: Number(invoice.shiftDiscountAmount),
      netAmount: Number(invoice.netAmount),
    })),
    configuration,
    roundMoneyAmount(periodMinimumWage.amountCop / 1000),
    periodMinimumWage.amountCop,
    savedRates,
  )
  const { rates, configuration: savedConfiguration, ...amounts } = calculated
  const snapshot = {
    ...amounts,
    minimumWageCop: periodMinimumWage.amountCop,
    minimumWageSourceYear: periodMinimumWage.sourceYear,
    minimumWageSourceUrl: periodMinimumWage.sourceUrl,
    minimumWageStale: periodMinimumWage.stale,
    pensionEnabled: savedConfiguration.pensionEnabled,
    arlEnabled: savedConfiguration.arlEnabled,
    arlRiskClass: savedConfiguration.arlRiskClass,
    compensationFundEnabled: savedConfiguration.compensationFundEnabled,
    ibcRatePpm: rates.ibcRatePpm,
    healthRatePpm: rates.healthRatePpm,
    pensionRatePpm: rates.pensionRatePpm,
    arlRatePpm: rates.arlRatePpm,
    fundRatePpm: rates.fundRatePpm,
    solidarityRatePpm: rates.solidarityRatePpm,
  }
  const record = await database.socialSecurityPeriod.upsert({
    where: { month: monthStart },
    create: { month: monthStart, ...snapshot },
    update: snapshot,
  })

  return {
    month,
    rates,
    configuration: savedConfiguration,
    minimumWage: periodMinimumWage,
    period: {
      grossAmount: Number(record.grossAmount),
      discounts: Number(record.discounts),
      netAmount: Number(record.netAmount),
      ibcAmount: Number(record.ibcAmount),
      healthAmountTenths: record.healthAmountTenths,
      pensionAmountTenths: record.pensionAmountTenths,
      arlAmountTenths: record.arlAmountTenths,
      fundAmountTenths: record.fundAmountTenths,
      solidarityAmountTenths: record.solidarityAmountTenths,
      totalAmountTenths: record.totalAmountTenths,
    },
  }
}
