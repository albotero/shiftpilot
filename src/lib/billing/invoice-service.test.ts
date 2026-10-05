import { describe, expect, it } from "vitest"
import {
  calculateInvoiceAmounts,
  getExpectedPaymentDate,
  getInvoicePaymentDays,
  invoiceMutationSchema,
} from "./invoice-service"

const baseInvoice = {
  serviceDate: "2026-10-01",
  invoiceDate: "2026-10-03",
  status: "PENDIENTE" as const,
  items: [{ description: "Servicio", quantity: 1, unitAmount: 1000 }],
}

describe("invoice service", () => {
  it("calculates POS discounts and shift discounts separately", () => {
    const invoice = invoiceMutationSchema.parse({ ...baseInvoice, type: "SOMA_POS", shiftDiscountAmount: 50 })

    expect(calculateInvoiceAmounts(invoice)).toMatchObject({
      grossAmount: 1000,
      discountAmount: 120,
      shiftDiscountAmount: 50,
      netAmount: 830,
    })
  })

  it("calculates prepaid, particular shifts, and Sedarte using their existing formulas", () => {
    const prepaid = invoiceMutationSchema.parse({ ...baseInvoice, type: "SOMA_PREPAGADA" })
    const particular = invoiceMutationSchema.parse({
      ...baseInvoice,
      type: "SOMA_PARTICULAR",
      privateShiftCount: 2,
    })
    const sedarte = invoiceMutationSchema.parse({ ...baseInvoice, type: "SEDARTE" })

    expect(calculateInvoiceAmounts(prepaid).netAmount).toBe(800)
    expect(calculateInvoiceAmounts(particular)).toMatchObject({
      discountAmount: 120,
      privateShiftAmount: 1370,
      netAmount: 2250,
    })
    expect(calculateInvoiceAmounts(sedarte)).toMatchObject({ discountAmount: 0, netAmount: 1000 })
  })

  it("rounds line gross amounts to integer thousands and computes due dates from invoice date", () => {
    const invoice = invoiceMutationSchema.parse({
      ...baseInvoice,
      type: "SOMA_PREPAGADA",
      items: [{ description: "Cantidad parcial", quantity: 1.25, unitAmount: 101 }],
    })

    expect(calculateInvoiceAmounts(invoice).items[0].grossAmount).toBe(126)
    expect(getInvoicePaymentDays("SOMA_POS", {})).toBe(90)
    expect(getInvoicePaymentDays("SOMA_PREPAGADA", {})).toBe(60)
    expect(getInvoicePaymentDays("SOMA_PARTICULAR", {})).toBe(30)
    expect(getInvoicePaymentDays("SEDARTE", {})).toBe(0)
    expect(getExpectedPaymentDate("2026-10-01", "2026-10-03", 90)).toBe("2027-01-01")
    expect(getExpectedPaymentDate("2026-10-01", null, 0)).toBe("2026-10-01")
  })

  it("rejects discounts and payment metadata on incompatible invoice types or statuses", () => {
    expect(invoiceMutationSchema.safeParse({ ...baseInvoice, type: "SEDARTE", shiftDiscountAmount: 10 }).success).toBe(
      false,
    )
    expect(invoiceMutationSchema.safeParse({ ...baseInvoice, type: "SOMA_POS", privateShiftCount: 1 }).success).toBe(
      false,
    )
    expect(invoiceMutationSchema.safeParse({ ...baseInvoice, type: "SOMA_POS", status: "PAGADA" }).success).toBe(false)
  })
})
