const RATE_DENOMINATOR = BigInt(1_000_000)
const MONEY_SCALE = BigInt(1_000)

function scaledAmount(amount: number, field = "amount") {
  const scaled = Math.round(amount * Number(MONEY_SCALE))
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(scaled) ||
    Math.abs(amount * Number(MONEY_SCALE) - scaled) > 0.000001
  ) {
    throw new RangeError(`${field} must be a non-negative amount with at most three decimals in thousands of COP`)
  }
  return BigInt(scaled)
}

export function assertMoneyAmount(amount: number, field = "amount") {
  scaledAmount(amount, field)
}

export function roundMoneyAmount(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("amount must be a non-negative finite number")
  const rounded = Math.round(amount * Number(MONEY_SCALE))
  if (!Number.isSafeInteger(rounded)) throw new RangeError("amount exceeds the supported money range")
  return rounded / Number(MONEY_SCALE)
}

export function addMoney(...amounts: number[]) {
  return Number(amounts.reduce((total, amount) => total + scaledAmount(amount), BigInt(0))) / Number(MONEY_SCALE)
}

export function subtractMoney(amount: number, ...deductions: number[]) {
  const result =
    scaledAmount(amount) - deductions.reduce((total, deduction) => total + scaledAmount(deduction), BigInt(0))
  return Number(result) / Number(MONEY_SCALE)
}

export function minMoney(left: number, right: number) {
  const leftScaled = scaledAmount(left)
  const rightScaled = scaledAmount(right)
  return Number(leftScaled < rightScaled ? leftScaled : rightScaled) / Number(MONEY_SCALE)
}

export function maxMoney(left: number, right: number) {
  const leftScaled = scaledAmount(left)
  const rightScaled = scaledAmount(right)
  return Number(leftScaled > rightScaled ? leftScaled : rightScaled) / Number(MONEY_SCALE)
}

export function percentageOf(amount: number, ratePpm: number) {
  const amountScaled = scaledAmount(amount)
  if (!Number.isSafeInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError("ratePpm must be a non-negative integer")
  }

  const numerator = amountScaled * BigInt(ratePpm)
  return Number((numerator + RATE_DENOMINATOR / BigInt(2)) / RATE_DENOMINATOR) / Number(MONEY_SCALE)
}

export function roundUpPercentage(amount: number, ratePpm: number) {
  return roundUpPercentageToScale(amount, ratePpm, 1)
}

export function roundUpPercentageToScale(amount: number, ratePpm: number, scale: number) {
  const amountScaled = scaledAmount(amount)
  if (!Number.isSafeInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError("ratePpm must be a non-negative integer")
  }
  if (!Number.isSafeInteger(scale) || scale < 1) {
    throw new RangeError("scale must be a positive integer")
  }

  const numerator = amountScaled * BigInt(ratePpm) * BigInt(scale)
  const denominator = RATE_DENOMINATOR * MONEY_SCALE
  return Number((numerator + denominator - BigInt(1)) / denominator)
}
