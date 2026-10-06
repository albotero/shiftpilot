import { percentageOf, roundUpPercentageToScale } from "@/lib/money/integer"

export const DEFAULT_SOCIAL_SECURITY_RATES = {
  ibcRatePpm: 400_000,
  healthRatePpm: 125_000,
  pensionRatePpm: 160_000,
  arlRatePpm: 24_360,
  fundRatePpm: 10_000,
} as const

export type SocialSecurityRates = {
  ibcRatePpm: number
  healthRatePpm: number
  pensionRatePpm: number
  arlRatePpm: number
  fundRatePpm: number
}

export type SocialSecurityBreakdown = {
  ibcAmount: number
  healthAmountTenths: number
  pensionAmountTenths: number
  arlAmountTenths: number
  fundAmountTenths: number
  totalAmountTenths: number
}

export function calculateIbc(netAmount: number, ibcRatePpm: number = DEFAULT_SOCIAL_SECURITY_RATES.ibcRatePpm) {
  return percentageOf(netAmount, ibcRatePpm)
}

export function calculateSocialSecurity(
  ibcAmount: number,
  rates: SocialSecurityRates = DEFAULT_SOCIAL_SECURITY_RATES,
): SocialSecurityBreakdown {
  const healthAmountTenths = roundUpPercentageToScale(ibcAmount, rates.healthRatePpm, 10)
  const pensionAmountTenths = roundUpPercentageToScale(ibcAmount, rates.pensionRatePpm, 10)
  const arlAmountTenths = roundUpPercentageToScale(ibcAmount, rates.arlRatePpm, 10)
  const fundAmountTenths = roundUpPercentageToScale(ibcAmount, rates.fundRatePpm, 10)

  return {
    ibcAmount,
    healthAmountTenths,
    pensionAmountTenths,
    arlAmountTenths,
    fundAmountTenths,
    totalAmountTenths: healthAmountTenths + pensionAmountTenths + arlAmountTenths + fundAmountTenths,
  }
}
