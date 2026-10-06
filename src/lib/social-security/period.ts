import { addMoney, maxMoney, roundMoneyAmount } from "@/lib/money/integer"
import type { Prisma } from "@prisma/client"
import {
  calculateIbc,
  calculateSocialSecurity,
  DEFAULT_SOCIAL_SECURITY_RATES,
  type SocialSecurityRates,
} from "./calculations"
import type { MinimumWageSnapshot } from "./minimum-wage"

export type InvoiceMonthlyAmounts = {
  grossAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  netAmount: number
}

const rateSettingKeys = {
  ibcRatePpm: "socialSecurity.ibcRatePpm",
  healthRatePpm: "socialSecurity.healthRatePpm",
  pensionRatePpm: "socialSecurity.pensionRatePpm",
  arlRatePpm: "socialSecurity.arlRatePpm",
  fundRatePpm: "socialSecurity.fundRatePpm",
} as const

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

export function getSocialSecurityRates(settings: { key: string; value: unknown }[]): SocialSecurityRates {
  const values = new Map(settings.map((setting) => [setting.key, setting.value]))
  return Object.fromEntries(
    Object.entries(rateSettingKeys).map(([field, key]) => {
      const value = values.get(key)
      const fallback = DEFAULT_SOCIAL_SECURITY_RATES[field as keyof SocialSecurityRates]
      return [
        field,
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : fallback,
      ]
    }),
  ) as SocialSecurityRates
}

export function calculateSocialSecurityPeriod(
  invoices: InvoiceMonthlyAmounts[],
  rates: SocialSecurityRates,
  minimumIbcAmount = 0,
) {
  const grossAmount = addMoney(...invoices.map((invoice) => invoice.grossAmount))
  const discounts = addMoney(...invoices.flatMap((invoice) => [invoice.discountAmount, invoice.shiftDiscountAmount]))
  const netAmount = addMoney(...invoices.map((invoice) => invoice.netAmount))
  const ibcPercentage = calculateIbc(netAmount, rates.ibcRatePpm)
  const ibcAmount = maxMoney(ibcPercentage, minimumIbcAmount)
  const contributions = calculateSocialSecurity(ibcAmount, rates)

  return {
    grossAmount,
    discounts,
    netAmount,
    ibcAmount,
    healthAmountTenths: contributions.healthAmountTenths,
    pensionAmountTenths: contributions.pensionAmountTenths,
    arlAmountTenths: contributions.arlAmountTenths,
    fundAmountTenths: contributions.fundAmountTenths,
    totalAmountTenths: contributions.totalAmountTenths,
  }
}

export async function recalculateSocialSecurityPeriod(
  database: SocialSecurityPeriodDatabase,
  month: string,
  minimumWage: MinimumWageSnapshot,
) {
  const monthStart = getMonthStart(month)
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const [invoices, settingRecords] = await Promise.all([
    database.invoice.findMany({
      where: { serviceDate: { gte: monthStart, lt: nextMonth } },
      select: { grossAmount: true, discountAmount: true, shiftDiscountAmount: true, netAmount: true },
    }),
    database.appSetting.findMany({ where: { key: { startsWith: "socialSecurity." } } }),
  ])
  const rates = getSocialSecurityRates(settingRecords)
  const amounts = calculateSocialSecurityPeriod(
    invoices.map((invoice) => ({
      grossAmount: Number(invoice.grossAmount),
      discountAmount: Number(invoice.discountAmount),
      shiftDiscountAmount: Number(invoice.shiftDiscountAmount),
      netAmount: Number(invoice.netAmount),
    })),
    rates,
    roundMoneyAmount(minimumWage.amountCop / 1000),
  )
  const record = await database.socialSecurityPeriod.upsert({
    where: { month: monthStart },
    create: { month: monthStart, ...amounts },
    update: amounts,
  })

  return {
    month,
    rates,
    minimumWage,
    period: {
      grossAmount: Number(record.grossAmount),
      discounts: Number(record.discounts),
      netAmount: Number(record.netAmount),
      ibcAmount: Number(record.ibcAmount),
      healthAmountTenths: record.healthAmountTenths,
      pensionAmountTenths: record.pensionAmountTenths,
      arlAmountTenths: record.arlAmountTenths,
      fundAmountTenths: record.fundAmountTenths,
      totalAmountTenths: record.totalAmountTenths,
    },
  }
}
