const RATE_DENOMINATOR = BigInt(1_000_000)

export function assertMoneyAmount(amount: number, field = "amount") {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in thousands of COP`)
  }
}

export function percentageOf(amount: number, ratePpm: number) {
  assertMoneyAmount(amount)
  if (!Number.isSafeInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError("ratePpm must be a non-negative integer")
  }

  const numerator = BigInt(amount) * BigInt(ratePpm)
  return Number((numerator + RATE_DENOMINATOR / BigInt(2)) / RATE_DENOMINATOR)
}

export function roundUpPercentage(amount: number, ratePpm: number) {
  return roundUpPercentageToScale(amount, ratePpm, 1)
}

export function roundUpPercentageToScale(amount: number, ratePpm: number, scale: number) {
  assertMoneyAmount(amount)
  if (!Number.isSafeInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError("ratePpm must be a non-negative integer")
  }
  if (!Number.isSafeInteger(scale) || scale < 1) {
    throw new RangeError("scale must be a positive integer")
  }

  const numerator = BigInt(amount) * BigInt(ratePpm) * BigInt(scale)
  return Number((numerator + RATE_DENOMINATOR - BigInt(1)) / RATE_DENOMINATOR)
}
