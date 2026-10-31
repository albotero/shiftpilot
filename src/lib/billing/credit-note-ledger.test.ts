import { describe, expect, it } from "vitest"
import { recalculateCreditNoteLedger, type CreditNoteLedgerEntry } from "./credit-note-ledger"

const invoice = {
  netAmount: 1000,
  discountAmount: 200,
  pdfTotalAmount: 1000,
  includeInIbc: true,
  status: "FACTURADA" as const,
}

const note = (number: string, amount: number): CreditNoteLedgerEntry => ({
  number,
  date: "2026-10-30",
  reason: "Cambio de forma de pago",
  amount,
})

describe("credit note ledger", () => {
  it("recalculates partial credits and the final annulment", () => {
    const partial = recalculateCreditNoteLedger(invoice, [note("NC1", 200)])
    expect(partial).toMatchObject({ netAmount: 800, discountAmount: 400, status: "FACTURADA", includeInIbc: true })

    const annulled = recalculateCreditNoteLedger({ ...invoice, ...partial }, [...partial.creditNotes, note("NC2", 800)])
    expect(annulled).toMatchObject({ netAmount: 0, status: "ANULADA", includeInIbc: false, action: "ANULACION" })
  })

  it("restores original invoice values when the last note is deleted", () => {
    const partial = recalculateCreditNoteLedger(invoice, [note("NC1", 200)])
    const restored = recalculateCreditNoteLedger({ ...invoice, ...partial }, [], partial.creditNotes[0])
    expect(restored).toMatchObject({
      creditNotes: [],
      netAmount: 1000,
      discountAmount: 200,
      pdfTotalAmount: 1000,
      includeInIbc: true,
      status: "FACTURADA",
    })
  })

  it("recomputes earlier notes after editing or deleting a note", () => {
    const notes = recalculateCreditNoteLedger(invoice, [note("NC1", 200), note("NC2", 300)])
    const edited = recalculateCreditNoteLedger({ ...invoice, ...notes }, [notes.creditNotes[0], note("NC2", 100)])
    expect(edited).toMatchObject({ netAmount: 700, discountAmount: 500, status: "FACTURADA" })

    const deleted = recalculateCreditNoteLedger({ ...invoice, ...notes }, [notes.creditNotes[0]])
    expect(deleted).toMatchObject({ netAmount: 800, discountAmount: 400, creditNotes: [{ number: "NC1" }] })
  })

  it("keeps the original base when editing the first note in the ledger", () => {
    const notes = recalculateCreditNoteLedger(invoice, [note("NC1", 200), note("NC2", 100)])
    const edited = recalculateCreditNoteLedger(
      { ...invoice, ...notes },
      [note("NC1", 300), notes.creditNotes[1]],
      notes.creditNotes[0],
    )
    expect(edited).toMatchObject({ netAmount: 600, discountAmount: 600, status: "FACTURADA" })
  })

  it("rejects accumulated credits above the original net", () => {
    expect(() => recalculateCreditNoteLedger(invoice, [note("NC1", 700), note("NC2", 400)])).toThrow(/supera/)
  })
})
