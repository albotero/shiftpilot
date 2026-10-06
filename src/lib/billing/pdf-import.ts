export type ImportedInvoiceType = "SOMA_POS" | "SOMA_PREPAGADA" | "SOMA_PARTICULAR" | "SEDARTE"

export type ImportedInvoiceItem = {
  description: string
  quantity: number
  unitAmount: number
  discountAmount: number
}

export type ImportedInvoice = {
  invoiceNumber: string | null
  type: ImportedInvoiceType | null
  serviceDate: string | null
  invoiceDate: string | null
  expectedPaymentDate: string | null
  pdfTotalAmount: number | null
  items: ImportedInvoiceItem[]
}

const amountPattern = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}`
const invoiceItemPattern = new RegExp(
  String.raw`^\s*\d+\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(${amountPattern})\s+(${amountPattern})\s+(${amountPattern})\s+(${amountPattern})\s*$`,
)

function amountInThousands(value: string) {
  const pesos = Number(value.replaceAll(",", ""))
  const wholePesos = Math.round(pesos)
  if (!Number.isFinite(pesos) || pesos < 0 || !Number.isSafeInteger(wholePesos)) return null
  if (Math.abs(pesos - wholePesos) > 0.000001) return null
  return wholePesos / 1000
}

function dateToIso(value: string | undefined) {
  if (!value) return null
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const [, day, month, year] = match
  const normalizedMonth = month.padStart(2, "0")
  const normalizedDay = day.padStart(2, "0")
  const isoDate = `${year}-${normalizedMonth}-${normalizedDay}`
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === isoDate ? isoDate : null
}

function findDate(text: string, label: string) {
  const match = new RegExp(`${label}\\s*:?\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})`, "i").exec(text)
  return dateToIso(match?.[1])
}

function findInvoiceType(text: string): ImportedInvoiceType | null {
  if (/\bSEDARTE\b/i.test(text)) return "SEDARTE"
  if (/\bPREPAGAD[AO]\b/i.test(text)) return "SOMA_PREPAGADA"
  if (/\bPARTICULAR\b/i.test(text)) return "SOMA_PARTICULAR"
  if (/\bPOS\b/i.test(text)) return "SOMA_POS"
  return null
}

export function parseInvoicePdfText(sourceText: string): ImportedInvoice {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  const text = lines.join("\n")
  const items = lines.flatMap((line) => {
    const match = invoiceItemPattern.exec(line)
    if (!match) return []
    const [, rawDescription, rawQuantity, rawUnitAmount, rawGrossAmount, rawDiscountAmount, rawTotal] = match
    const quantity = Number(rawQuantity)
    const unitAmount = amountInThousands(rawUnitAmount)
    const grossAmount = amountInThousands(rawGrossAmount)
    const discountAmount = amountInThousands(rawDiscountAmount)
    const totalAmount = amountInThousands(rawTotal)
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      unitAmount === null ||
      grossAmount === null ||
      discountAmount === null ||
      totalAmount === null
    ) {
      return []
    }
    return [
      {
        description: rawDescription.trim(),
        quantity,
        unitAmount,
        discountAmount,
      },
    ]
  })

  if (items.length === 0) throw new Error("No se encontraron partidas con el formato esperado.")

  const serviceDates = items
    .map((item) => /\d{1,2}\/\d{1,2}\/\d{4}/.exec(item.description)?.[0])
    .map(dateToIso)
    .filter((date): date is string => date !== null)
    .sort()
  const invoiceDate = findDate(text, "Expedición") ?? findDate(text, "Generación")
  const invoiceNumber = /\bNo\.?\s*([A-Z]{1,8}\s*-?\s*\d+)\b/i.exec(text)?.[1]?.replace(/\s+/g, "") ?? null
  const totalMatch = new RegExp(`Total\\s+a\\s+Pagar\\s*\\$?\\s*(${amountPattern})`, "i").exec(text)
  const pdfTotalAmount = totalMatch ? amountInThousands(totalMatch[1]) : null
  if (pdfTotalAmount === null) throw new Error("No se encontró el total a pagar de la factura.")

  return {
    invoiceNumber,
    type: findInvoiceType(text),
    serviceDate: invoiceDate ?? serviceDates[0] ?? null,
    invoiceDate,
    expectedPaymentDate: findDate(text, "Vencimiento"),
    pdfTotalAmount,
    items,
  }
}
