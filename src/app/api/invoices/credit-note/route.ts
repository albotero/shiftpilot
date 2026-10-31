import type { InvoiceStatus } from "@prisma/client"
import { z } from "zod"
import { getMinimumWageForYear } from "@/lib/social-security/minimum-wage"
import { recalculateSocialSecurityPeriod } from "@/lib/social-security/period"
import { normalizeInvoiceNumber } from "@/lib/billing/invoice-identifiers"
import { recalculateCreditNoteLedger, type CreditNoteLedgerEntry } from "@/lib/billing/credit-note-ledger"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const creditNoteSchema = z.object({
  creditNoteNumber: z.string().trim().min(1).max(64),
  originalInvoiceNumber: z.string().trim().min(1).max(64),
  creditNoteDate: z.union([z.iso.date(), z.null()]),
  reason: z.string().trim().max(400),
  amount: z
    .number()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER / 1000)
    .refine((amount) => Math.abs(amount * 1000 - Math.round(amount * 1000)) < 0.000001),
})

const editCreditNoteSchema = creditNoteSchema.omit({ originalInvoiceNumber: true }).extend({
  invoiceId: z.string().min(1),
})
const deleteCreditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  creditNoteNumber: z.string().trim().min(1).max(64),
})

type CreditNoteInvoice = {
  id: string
  invoiceNumber: string | null
  serviceDate: Date
  netAmount: { toString(): string } | number
  discountAmount: { toString(): string } | number
  pdfTotalAmount: { toString(): string } | number | null
  includeInIbc: boolean
  status: InvoiceStatus
  creditNotes: unknown
}

function parseCreditNotes(value: unknown): CreditNoteLedgerEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (note): note is CreditNoteLedgerEntry =>
      typeof note === "object" &&
      note !== null &&
      "number" in note &&
      typeof note.number === "string" &&
      "amount" in note &&
      typeof note.amount === "number" &&
      "reason" in note &&
      typeof note.reason === "string",
  )
}

function creditNoteIndex(notes: CreditNoteLedgerEntry[], number: string) {
  return notes.findIndex((note) => normalizeInvoiceNumber(note.number) === normalizeInvoiceNumber(number))
}

async function saveCreditNoteLedger(
  invoice: CreditNoteInvoice,
  notes: CreditNoteLedgerEntry[],
  baselineNote?: CreditNoteLedgerEntry,
) {
  const serviceMonth = invoice.serviceDate.toISOString().slice(0, 7)
  const ledger = recalculateCreditNoteLedger(
    {
      netAmount: Number(invoice.netAmount),
      discountAmount: Number(invoice.discountAmount),
      pdfTotalAmount: invoice.pdfTotalAmount === null ? null : Number(invoice.pdfTotalAmount),
      includeInIbc: invoice.includeInIbc,
      status: invoice.status,
    },
    notes,
    baselineNote,
  )
  const minimumWage = await getMinimumWageForYear(prisma, Number(serviceMonth.slice(0, 4)))
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.invoice.update({
      where: { id: invoice.id },
      data: {
        creditNotes: ledger.creditNotes,
        netAmount: ledger.netAmount,
        pdfTotalAmount: ledger.pdfTotalAmount,
        discountAmount: ledger.discountAmount,
        status: ledger.status,
        includeInIbc: ledger.includeInIbc,
      },
      select: { id: true, invoiceNumber: true, serviceDate: true, status: true },
    })
    await recalculateSocialSecurityPeriod(transaction, serviceMonth, minimumWage)
    return result
  })
  return {
    invoiceId: updated.id,
    invoiceNumber: updated.invoiceNumber,
    serviceDate: updated.serviceDate.toISOString().slice(0, 10),
    status: updated.status,
    action: ledger.action,
    creditNotes: ledger.creditNotes,
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }
  const parsed = creditNoteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Nota crédito inválida" }, { status: 400 })

  try {
    const candidates = await prisma.invoice.findMany({
      where: { invoiceNumber: { not: null } },
      include: { items: true },
    })
    const matchingInvoices = candidates.filter(
      (invoice) =>
        normalizeInvoiceNumber(invoice.invoiceNumber ?? "") ===
        normalizeInvoiceNumber(parsed.data.originalInvoiceNumber),
    )
    if (matchingInvoices.length === 0) {
      return Response.json(
        { error: `No se encontró la factura ${parsed.data.originalInvoiceNumber}.` },
        { status: 404 },
      )
    }
    if (matchingInvoices.length > 1) {
      return Response.json(
        { error: "Hay varias facturas con ese número; corrige la numeración antes de aplicar la nota." },
        { status: 409 },
      )
    }

    const invoice = matchingInvoices[0]
    const creditNotes = parseCreditNotes(invoice.creditNotes)
    const duplicate = creditNoteIndex(creditNotes, parsed.data.creditNoteNumber) >= 0
    if (duplicate) return Response.json({ error: "Esta nota crédito ya fue aplicada a la factura." }, { status: 409 })
    const creditNote: CreditNoteLedgerEntry = {
      number: parsed.data.creditNoteNumber,
      date: parsed.data.creditNoteDate,
      reason: parsed.data.reason,
      amount: parsed.data.amount,
    }
    return Response.json(await saveCreditNoteLedger(invoice, [...creditNotes, creditNote], creditNotes[0]))
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "No se pudo aplicar la nota crédito" },
      { status: error instanceof RangeError ? 409 : 503 },
    )
  }
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }
  const parsed = editCreditNoteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Nota crédito inválida" }, { status: 400 })

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } })
    if (!invoice) return Response.json({ error: "No se encontró la factura original" }, { status: 404 })
    const notes = parseCreditNotes(invoice.creditNotes)
    const noteIndex = creditNoteIndex(notes, parsed.data.creditNoteNumber)
    if (noteIndex < 0) return Response.json({ error: "No se encontró la nota crédito" }, { status: 404 })
    const notesWithNewNumber = notes.some(
      (note, index) =>
        index !== noteIndex &&
        normalizeInvoiceNumber(note.number) === normalizeInvoiceNumber(parsed.data.creditNoteNumber),
    )
    if (notesWithNewNumber)
      return Response.json({ error: "Ya existe una nota crédito con ese número" }, { status: 409 })

    const updatedNotes = notes.map((note, index) =>
      index === noteIndex
        ? {
            ...note,
            number: parsed.data.creditNoteNumber,
            date: parsed.data.creditNoteDate,
            reason: parsed.data.reason,
            amount: parsed.data.amount,
          }
        : note,
    )
    const result = await saveCreditNoteLedger(invoice, updatedNotes, notes[0])
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "No se pudo modificar la nota crédito" },
      { status: error instanceof RangeError ? 409 : 503 },
    )
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }
  const parsed = deleteCreditNoteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Identificadores de nota crédito inválidos" }, { status: 400 })

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } })
    if (!invoice) return Response.json({ error: "No se encontró la factura original" }, { status: 404 })
    const notes = parseCreditNotes(invoice.creditNotes)
    const noteIndex = creditNoteIndex(notes, parsed.data.creditNoteNumber)
    if (noteIndex < 0) return Response.json({ error: "No se encontró la nota crédito" }, { status: 404 })

    const remainingNotes = notes.filter((_, index) => index !== noteIndex)
    const baselineNote = notes.find((note) => note.originalInvoiceAmount !== undefined) ?? notes[0]
    return Response.json(await saveCreditNoteLedger(invoice, remainingNotes, baselineNote))
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "No se pudo eliminar la nota crédito" },
      { status: error instanceof RangeError ? 409 : 503 },
    )
  }
}
