import { addMoney, maxMoney, roundMoneyAmount } from "@/lib/money/integer"
import type { Prisma } from "@prisma/client"
import {
  calculateSocialSecurity,
  DEFAULT_SOCIAL_SECURITY_CONFIGURATION,
  getCalculatedSocialSecurityRates,
  getSocialSecurityConfiguration,
  type SocialSecurityConfiguration,
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
) {
  const grossAmount = addMoney(...invoices.map((invoice) => invoice.grossAmount))
  const discounts = addMoney(...invoices.flatMap((invoice) => [invoice.discountAmount, invoice.shiftDiscountAmount]))
  const netAmount = addMoney(...invoices.map((invoice) => invoice.netAmount))
  const ibcPercentage = roundMoneyAmount(netAmount * 0.4)
  const ibcAmount = maxMoney(ibcPercentage, minimumIbcAmount)
  const rates = getCalculatedSocialSecurityRates(configuration, ibcAmount, minimumWageCop)
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
  const configuration = getSocialSecurityConfiguration(settingRecords)
  const calculated = calculateSocialSecurityPeriod(
    invoices.map((invoice) => ({
      grossAmount: Number(invoice.grossAmount),
      discountAmount: Number(invoice.discountAmount),
      shiftDiscountAmount: Number(invoice.shiftDiscountAmount),
      netAmount: Number(invoice.netAmount),
    })),
    configuration,
    roundMoneyAmount(minimumWage.amountCop / 1000),
    minimumWage.amountCop,
  )
  const { rates, configuration: savedConfiguration, ...amounts } = calculated
  const record = await database.socialSecurityPeriod.upsert({
    where: { month: monthStart },
    create: { month: monthStart, ...amounts },
    update: amounts,
  })

  return {
    month,
    rates,
    configuration: savedConfiguration,
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
      solidarityAmountTenths: record.solidarityAmountTenths,
      totalAmountTenths: record.totalAmountTenths,
    },
  }
}
