import { percentageOf, roundUpPercentageToScale } from "@/lib/money/integer"

export const DEFAULT_SOCIAL_SECURITY_RATES = {
  ibcRatePpm: 400_000,
  healthRatePpm: 125_000,
  pensionRatePpm: 160_000,
  arlRatePpm: 24_360,
  fundRatePpm: 0,
  solidarityRatePpm: 0,
} as const

export const DEFAULT_SOCIAL_SECURITY_CONFIGURATION = {
  pensionEnabled: true,
  arlEnabled: true,
  arlRiskClass: "III",
  compensationFundEnabled: false,
} as const

export type ArlRiskClass = "I" | "II" | "III" | "IV" | "V"

export type SocialSecurityConfiguration = {
  pensionEnabled: boolean
  arlEnabled: boolean
  arlRiskClass: ArlRiskClass
  compensationFundEnabled: boolean
}

export const arlRatePpmByClass: Record<ArlRiskClass, number> = {
  I: 5_220,
  II: 10_440,
  III: 24_360,
  IV: 43_500,
  V: 69_600,
}

export type SocialSecurityRates = {
  ibcRatePpm: number
  healthRatePpm: number
  pensionRatePpm: number
  arlRatePpm: number
  fundRatePpm: number
  solidarityRatePpm: number
}

export type SocialSecurityBreakdown = {
  ibcAmount: number
  healthAmountTenths: number
  pensionAmountTenths: number
  arlAmountTenths: number
  fundAmountTenths: number
  solidarityAmountTenths: number
  totalAmountTenths: number
}

export function getSocialSecurityConfiguration(
  settings: { key: string; value: unknown }[],
): SocialSecurityConfiguration {
  const values = new Map(settings.map((setting) => [setting.key, setting.value]))
  const stored = values.get("socialSecurity.configuration")
  const candidate =
    typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as Partial<SocialSecurityConfiguration>)
      : {}
  const legacyPensionRate = values.get("socialSecurity.pensionRatePpm")
  const legacyArlRate = values.get("socialSecurity.arlRatePpm")
  const legacyArlRiskClass =
    typeof legacyArlRate === "number" && Number.isFinite(legacyArlRate)
      ? (Object.entries(arlRatePpmByClass) as [ArlRiskClass, number][]).reduce((closest, current) =>
          Math.abs(current[1] - legacyArlRate) < Math.abs(closest[1] - legacyArlRate) ? current : closest,
        )[0]
      : DEFAULT_SOCIAL_SECURITY_CONFIGURATION.arlRiskClass
  return {
    pensionEnabled:
      typeof candidate.pensionEnabled === "boolean"
        ? candidate.pensionEnabled
        : typeof legacyPensionRate === "number"
          ? legacyPensionRate > 0
          : DEFAULT_SOCIAL_SECURITY_CONFIGURATION.pensionEnabled,
    arlEnabled:
      typeof candidate.arlEnabled === "boolean"
        ? candidate.arlEnabled
        : typeof legacyArlRate === "number"
          ? legacyArlRate > 0
          : DEFAULT_SOCIAL_SECURITY_CONFIGURATION.arlEnabled,
    arlRiskClass:
      candidate.arlRiskClass && candidate.arlRiskClass in arlRatePpmByClass
        ? candidate.arlRiskClass
        : legacyArlRiskClass,
    compensationFundEnabled:
      typeof candidate.compensationFundEnabled === "boolean"
        ? candidate.compensationFundEnabled
        : DEFAULT_SOCIAL_SECURITY_CONFIGURATION.compensationFundEnabled,
  }
}

export function getSolidarityRatePpm(ibcAmount: number, minimumWageCop: number, pensionEnabled: boolean) {
  if (!pensionEnabled || minimumWageCop <= 0) return 0
  const ibcCop = Math.round(ibcAmount * 1000)
  if (ibcCop < minimumWageCop * 4) return 0
  if (ibcCop < minimumWageCop * 16) return 10_000
  if (ibcCop < minimumWageCop * 17) return 12_000
  if (ibcCop < minimumWageCop * 18) return 14_000
  if (ibcCop < minimumWageCop * 19) return 16_000
  if (ibcCop < minimumWageCop * 20) return 18_000
  return 20_000
}

export function getCalculatedSocialSecurityRates(
  configuration: SocialSecurityConfiguration,
  ibcAmount: number,
  minimumWageCop: number,
): SocialSecurityRates {
  return {
    ibcRatePpm: 400_000,
    healthRatePpm: 125_000,
    pensionRatePpm: configuration.pensionEnabled ? 160_000 : 0,
    arlRatePpm: configuration.arlEnabled ? arlRatePpmByClass[configuration.arlRiskClass] : 0,
    fundRatePpm: configuration.compensationFundEnabled ? 20_000 : 0,
    solidarityRatePpm: getSolidarityRatePpm(ibcAmount, minimumWageCop, configuration.pensionEnabled),
  }
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
  const solidarityAmountTenths = roundUpPercentageToScale(ibcAmount, rates.solidarityRatePpm, 10)

  return {
    ibcAmount,
    healthAmountTenths,
    pensionAmountTenths,
    arlAmountTenths,
    fundAmountTenths,
    solidarityAmountTenths,
    totalAmountTenths:
      healthAmountTenths + pensionAmountTenths + arlAmountTenths + fundAmountTenths + solidarityAmountTenths,
  }
}
