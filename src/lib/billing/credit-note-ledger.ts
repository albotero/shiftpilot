import type { InvoiceStatus } from "@prisma/client"
import { addMoney, subtractMoney } from "@/lib/money/integer"

export type CreditNoteAction = "ANULACION" | "MODIFICACION"

export type CreditNoteLedgerEntry = {
  number: string
  date: string | null
  reason: string
  amount: number
  action?: CreditNoteAction
  originalAmount?: number
  originalInvoiceAmount?: number
  resultingAmount?: number
  originalDiscountAmount?: number
  originalPdfTotalAmount?: number | null
  originalIncludeInIbc?: boolean
  originalStatus?: InvoiceStatus
}

export type CreditNoteInvoiceBase = {
  netAmount: number
  discountAmount: number
  pdfTotalAmount: number | null
  includeInIbc: boolean
  status: InvoiceStatus
}

export function recalculateCreditNoteLedger(
  invoice: CreditNoteInvoiceBase,
  notes: CreditNoteLedgerEntry[],
  baselineNote?: CreditNoteLedgerEntry,
) {
  const firstNote = notes.find((note) => note.originalInvoiceAmount !== undefined) ?? baselineNote ?? notes[0]
  const originalAmount = firstNote?.originalInvoiceAmount ?? firstNote?.originalAmount ?? invoice.netAmount
  const originalDiscountAmount =
    firstNote?.originalDiscountAmount ??
    subtractMoney(
      invoice.discountAmount,
      addMoney(...notes.filter((note) => note.action === "MODIFICACION").map((note) => note.amount)),
    )
  const originalPdfTotalAmount = firstNote?.originalPdfTotalAmount ?? invoice.pdfTotalAmount
  const originalIncludeInIbc = firstNote?.originalIncludeInIbc ?? invoice.includeInIbc
  const originalStatus = firstNote?.originalStatus ?? (invoice.status === "ANULADA" ? "FACTURADA" : invoice.status)

  let remainingAmount = originalAmount
  const creditNotes = notes.map((note) => {
    if (note.amount > remainingAmount) {
      throw new RangeError("El valor acumulado de las notas crédito supera el neto original.")
    }
    const noteOriginalAmount = remainingAmount
    remainingAmount = subtractMoney(remainingAmount, note.amount)
    const action: CreditNoteAction = remainingAmount === 0 ? "ANULACION" : "MODIFICACION"
    return {
      ...note,
      action,
      originalAmount: noteOriginalAmount,
      originalInvoiceAmount: originalAmount,
      resultingAmount: remainingAmount,
      originalDiscountAmount,
      originalPdfTotalAmount,
      originalIncludeInIbc,
      originalStatus,
    }
  })

  const totalCreditAmount = addMoney(...notes.map((note) => note.amount))
  const annulled = remainingAmount === 0
  return {
    creditNotes,
    netAmount: remainingAmount,
    pdfTotalAmount: notes.length ? remainingAmount : originalPdfTotalAmount,
    discountAmount: addMoney(originalDiscountAmount, totalCreditAmount),
    status: annulled ? "ANULADA" : originalStatus,
    includeInIbc: annulled ? false : originalIncludeInIbc,
    action: annulled ? ("ANULACION" as const) : ("MODIFICACION" as const),
  }
}
