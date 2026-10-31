import { addMoney } from "@/lib/money/integer"

export type InvoiceEntityAmount = {
  institutionName: string | null
  type: string
  grossAmount: number
  netAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  status: string
}

export function getInvoiceTotalDiscount(invoice: Pick<InvoiceEntityAmount, "discountAmount" | "shiftDiscountAmount">) {
  return addMoney(invoice.discountAmount, invoice.shiftDiscountAmount)
}

export function sumInvoiceEntityAmounts(amounts: number[]) {
  return addMoney(...amounts)
}

export function groupInvoiceAmountsByInstitution(invoices: InvoiceEntityAmount[]) {
  const grouped = new Map<
    string,
    { institutionName: string; count: number; grossAmount: number; discountAmount: number; netAmount: number }
  >()
  for (const invoice of invoices) {
    if (invoice.status === "ANULADA") continue
    const institutionName = invoice.institutionName?.trim() || invoice.type.replaceAll("_", " ")
    const existing = grouped.get(institutionName) ?? {
      institutionName,
      count: 0,
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
    }
    existing.count += 1
    existing.grossAmount = addMoney(existing.grossAmount, invoice.grossAmount)
    existing.discountAmount = addMoney(existing.discountAmount, getInvoiceTotalDiscount(invoice))
    existing.netAmount = addMoney(existing.netAmount, invoice.netAmount)
    grouped.set(institutionName, existing)
  }
  return [...grouped.values()].sort(
    (left, right) =>
      right.netAmount - left.netAmount || left.institutionName.localeCompare(right.institutionName, "es"),
  )
}
