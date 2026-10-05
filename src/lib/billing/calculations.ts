import { assertMoneyAmount, percentageOf } from "@/lib/money/integer"

export const DEFAULT_BILLING_SETTINGS = {
  posDiscountRatePpm: 120_000,
  prepaidDiscountRatePpm: 200_000,
  particularDiscountRatePpm: 120_000,
  privateShiftAmount: 685,
} as const

export type BillingSettings = {
  posDiscountRatePpm: number
  prepaidDiscountRatePpm: number
  particularDiscountRatePpm: number
  privateShiftAmount: number
}

export type InvoiceCalculation = {
  grossAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  privateShiftAmount: number
  netAmount: number
}

function getNetAmount(grossAmount: number, discountAmount: number, shiftDiscountAmount = 0) {
  assertMoneyAmount(grossAmount, "grossAmount")
  assertMoneyAmount(discountAmount, "discountAmount")
  assertMoneyAmount(shiftDiscountAmount, "shiftDiscountAmount")
  const netAmount = grossAmount - discountAmount - shiftDiscountAmount
  if (netAmount < 0) throw new RangeError("Invoice discounts cannot exceed the gross amount")
  return netAmount
}

export function calculatePosInvoice(
  grossAmount: number,
  shiftDiscountAmount = 0,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS,
): InvoiceCalculation {
  const discountAmount = percentageOf(grossAmount, settings.posDiscountRatePpm)
  return {
    grossAmount,
    discountAmount,
    shiftDiscountAmount,
    privateShiftAmount: 0,
    netAmount: getNetAmount(grossAmount, discountAmount, shiftDiscountAmount),
  }
}

export function calculatePrepaidInvoice(
  grossAmount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS,
): InvoiceCalculation {
  const discountAmount = percentageOf(grossAmount, settings.prepaidDiscountRatePpm)
  return {
    grossAmount,
    discountAmount,
    shiftDiscountAmount: 0,
    privateShiftAmount: 0,
    netAmount: getNetAmount(grossAmount, discountAmount),
  }
}

export function calculateParticularInvoice(
  grossAmount: number,
  privateShiftCount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS,
): InvoiceCalculation {
  if (!Number.isSafeInteger(privateShiftCount) || privateShiftCount < 0) {
    throw new RangeError("privateShiftCount must be a non-negative integer")
  }

  const discountAmount = percentageOf(grossAmount, settings.particularDiscountRatePpm)
  const netAmount = getNetAmount(grossAmount, discountAmount)
  const privateShiftAmount = privateShiftCount * settings.privateShiftAmount
  assertMoneyAmount(privateShiftAmount, "privateShiftAmount")

  return {
    grossAmount,
    discountAmount,
    shiftDiscountAmount: 0,
    privateShiftAmount,
    netAmount: netAmount + privateShiftAmount,
  }
}

export function calculateSedarteInvoice(grossAmount: number): InvoiceCalculation {
  assertMoneyAmount(grossAmount, "grossAmount")
  return {
    grossAmount,
    discountAmount: 0,
    shiftDiscountAmount: 0,
    privateShiftAmount: 0,
    netAmount: grossAmount,
  }
}
