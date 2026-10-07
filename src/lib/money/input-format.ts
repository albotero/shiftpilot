export function formatMoneyInput(value: string) {
  if (!value) return ""
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

function normalizeDecimal(integerPart: string, fractionPart: string) {
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0"
  const fraction = fractionPart.replace(/\D/g, "").replace(/0+$/, "")
  return fraction ? `${integer}.${fraction}` : integer
}

export function parseMoneyInput(value: string, allowTrailingSeparator = false): string | null {
  const input = value.trim().replace(/\s/g, "")
  if (!input) return ""
  if (!/^\d[\d.,]*$/.test(input)) return null

  if (input.includes(",")) {
    const decimalIndex = input.lastIndexOf(",")
    const integerPart = input.slice(0, decimalIndex).replace(/[.,]/g, "")
    const fractionPart = input.slice(decimalIndex + 1)
    if (!integerPart || (!fractionPart && !allowTrailingSeparator) || fractionPart.includes(".")) return null
    return normalizeDecimal(integerPart, fractionPart)
  }

  const periods = input.match(/\./g)?.length ?? 0
  if (periods > 1) return normalizeDecimal(input.replace(/\./g, ""), "")
  if (periods === 0) return normalizeDecimal(input, "")

  const [integerPart, fractionPart = ""] = input.split(".")
  if (fractionPart.length === 3 && integerPart.length <= 3) {
    return normalizeDecimal(integerPart + fractionPart, "")
  }
  if (!fractionPart && !allowTrailingSeparator) return null
  return normalizeDecimal(integerPart, fractionPart)
}
