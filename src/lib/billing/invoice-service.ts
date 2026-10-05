import { z } from "zod"
import {
  calculateParticularInvoice,
  calculatePosInvoice,
  calculatePrepaidInvoice,
  calculateSedarteInvoice,
  DEFAULT_BILLING_SETTINGS,
  type BillingSettings,
} from "./calculations"
import { assertMoneyAmount } from "@/lib/money/integer"

export const invoiceTypes = ["SOMA_POS", "SOMA_PREPAGADA", "SOMA_PARTICULAR", "SEDARTE"] as const
export const invoiceStatuses = ["PENDIENTE", "FACTURADA", "POR_COBRAR", "PAGADA", "VENCIDA"] as const

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(120),
  quantity: z
    .number()
    .positive()
    .max(999999)
    .refine((quantity) => Number.isInteger(quantity * 100), "Usa máximo dos decimales en la cantidad"),
  unitAmount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

export const invoiceMutationSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(invoiceTypes),
    serviceDate: z.iso.date(),
    invoiceDate: z.union([z.iso.date(), z.null()]).optional(),
    status: z.enum(invoiceStatuses),
    paidAt: z.union([z.iso.date(), z.null()]).optional(),
    shiftDiscountAmount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
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
    const grossAmount = Math.round(item.quantity * item.unitAmount)
    assertMoneyAmount(grossAmount, "invoiceItem.grossAmount")
    return { ...item, grossAmount }
  })
  const grossAmount = items.reduce((total, item) => total + item.grossAmount, 0)
  assertMoneyAmount(grossAmount, "grossAmount")

  const calculation = (() => {
    switch (invoice.type) {
      case "SOMA_POS":
        return calculatePosInvoice(grossAmount, invoice.shiftDiscountAmount ?? 0, settings)
      case "SOMA_PREPAGADA":
        return calculatePrepaidInvoice(grossAmount, settings)
      case "SOMA_PARTICULAR":
        return calculateParticularInvoice(grossAmount, invoice.privateShiftCount ?? 0, settings)
      case "SEDARTE":
        return calculateSedarteInvoice(grossAmount)
    }
  })()

  return { items, ...calculation }
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
