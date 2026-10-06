import { z } from "zod"
import {
  calculateParticularInvoice,
  calculatePosInvoice,
  calculatePrepaidInvoice,
  calculateSedarteInvoice,
  DEFAULT_BILLING_SETTINGS,
  type BillingSettings,
} from "./calculations"
import { addMoney, assertMoneyAmount, roundMoneyAmount, subtractMoney } from "@/lib/money/integer"

export const invoiceTypes = ["SOMA_POS", "SOMA_PREPAGADA", "SOMA_PARTICULAR", "SEDARTE"] as const
export const invoiceStatuses = ["PENDIENTE", "FACTURADA", "POR_COBRAR", "PAGADA", "VENCIDA"] as const

function moneyAmountSchema() {
  return z
    .number()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER / 1000)
    .refine((amount) => Math.abs(amount * 1000 - Math.round(amount * 1000)) < 0.000001, "Usa máximo tres decimales")
}

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(120),
  quantity: z
    .number()
    .positive()
    .max(999999)
    .refine((quantity) => Number.isInteger(quantity * 100), "Usa máximo dos decimales en la cantidad"),
  unitAmount: moneyAmountSchema(),
  discountAmount: moneyAmountSchema().optional(),
})

export const invoiceMutationSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(invoiceTypes),
    serviceDate: z.iso.date(),
    invoiceDate: z.union([z.iso.date(), z.null()]).optional(),
    invoiceNumber: z.string().trim().max(64).nullable().optional(),
    expectedPaymentDate: z.union([z.iso.date(), z.null()]).optional(),
    pdfTotalAmount: moneyAmountSchema().nullable().optional(),
    status: z.enum(invoiceStatuses),
    paidAt: z.union([z.iso.date(), z.null()]).optional(),
    shiftDiscountAmount: moneyAmountSchema().optional(),
    privateShiftCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    notes: z.string().trim().max(500).optional(),
    items: z.array(invoiceItemSchema).min(1).max(100),
  })
  .superRefine((invoice, context) => {
    if (invoice.type !== "SOMA_POS" && (invoice.shiftDiscountAmount ?? 0) !== 0) {
      context.addIssue({
        code: "custom",
        message: "El descuento de turnos sólo aplica a Soma POS",
        path: ["shiftDiscountAmount"],
      })
    }
    if (invoice.type !== "SOMA_PARTICULAR" && (invoice.privateShiftCount ?? 0) !== 0) {
      context.addIssue({
        code: "custom",
        message: "Los turnos particulares sólo aplican a Soma Particular",
        path: ["privateShiftCount"],
      })
    }
    if (invoice.status === "PAGADA" && !invoice.paidAt) {
      context.addIssue({ code: "custom", message: "Indica la fecha de pago", path: ["paidAt"] })
    }
    if (invoice.status !== "PAGADA" && invoice.paidAt) {
      context.addIssue({ code: "custom", message: "La fecha de pago requiere estado PAGADA", path: ["paidAt"] })
    }
  })

export type InvoiceMutation = z.infer<typeof invoiceMutationSchema>

export function calculateInvoiceAmounts(
  invoice: InvoiceMutation,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS,
) {
  const items = invoice.items.map((item) => {
    const grossAmount = roundMoneyAmount(item.quantity * item.unitAmount)
    const discountAmount = item.discountAmount ?? 0
    assertMoneyAmount(grossAmount, "invoiceItem.grossAmount")
    assertMoneyAmount(discountAmount, "invoiceItem.discountAmount")
    if (discountAmount > grossAmount) throw new RangeError("Invoice item discounts cannot exceed its gross amount")
    return { ...item, discountAmount, grossAmount }
  })
  const grossAmount = addMoney(...items.map((item) => item.grossAmount))
  const itemDiscountAmount = addMoney(...items.map((item) => item.discountAmount))
  assertMoneyAmount(grossAmount, "grossAmount")
  assertMoneyAmount(itemDiscountAmount, "itemDiscountAmount")

  if (invoice.pdfTotalAmount !== undefined && invoice.pdfTotalAmount !== null) {
    assertMoneyAmount(invoice.pdfTotalAmount, "pdfTotalAmount")
    if (invoice.pdfTotalAmount > grossAmount) throw new RangeError("Invoice PDF total cannot exceed gross amount")
    return {
      items,
      grossAmount,
      discountAmount: subtractMoney(grossAmount, invoice.pdfTotalAmount),
      shiftDiscountAmount: 0,
      privateShiftAmount: 0,
      netAmount: invoice.pdfTotalAmount,
    }
  }

  const calculationBase = subtractMoney(grossAmount, itemDiscountAmount)

  const calculation = (() => {
    switch (invoice.type) {
      case "SOMA_POS":
        return calculatePosInvoice(calculationBase, invoice.shiftDiscountAmount ?? 0, settings)
      case "SOMA_PREPAGADA":
        return calculatePrepaidInvoice(calculationBase, settings)
      case "SOMA_PARTICULAR":
        return calculateParticularInvoice(calculationBase, invoice.privateShiftCount ?? 0, settings)
      case "SEDARTE":
        return calculateSedarteInvoice(calculationBase)
    }
  })()

  return {
    items,
    ...calculation,
    grossAmount,
    discountAmount: addMoney(calculation.discountAmount, itemDiscountAmount),
  }
}

export function getInvoicePaymentDays(type: InvoiceMutation["type"], settings: Record<string, number>) {
  switch (type) {
    case "SOMA_POS":
      return settings["billing.pos.paymentDays"] ?? 90
    case "SOMA_PREPAGADA":
      return settings["billing.prepaid.paymentDays"] ?? 60
    case "SOMA_PARTICULAR":
      return settings["billing.particular.paymentDays"] ?? 30
    case "SEDARTE":
      return settings["billing.sedarte.paymentDays"] ?? 0
  }
}

export function getExpectedPaymentDate(
  serviceDate: string,
  invoiceDate: string | null | undefined,
  paymentDays: number,
) {
  const baseDate = new Date(`${invoiceDate ?? serviceDate}T12:00:00.000Z`)
  baseDate.setUTCDate(baseDate.getUTCDate() + paymentDays)
  return baseDate.toISOString().slice(0, 10)
}
