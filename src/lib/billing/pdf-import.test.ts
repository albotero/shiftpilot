import { describe, expect, it } from "vitest"
import { parseCreditNotePdfText, parseInvoicePdfText } from "./pdf-import"

const oneItemInvoice = `
Factura electronica de venta
No. SF 177
Señores SEDARTE IPS SAS
Fecha y hora Factura
Generación 05/10/2026, 18:06
Expedición 05/10/2026, 18:06
Vencimiento 05/10/2026
Ítem Descripción Cantidad Vr. Unitario Vr. Bruto Valor desc. Vr. Total
1 SERVICIOS ANESTESIOLOGIA - 02/10/2026 14:30 1.00 800,000.00 800,000.00 0.00 800,000.00
Total a Pagar 800,000.00
`

describe("invoice PDF import parser", () => {
  it("parses the invoice number, dates, type, one item, and COP amounts in thousands", () => {
    expect(parseInvoicePdfText(oneItemInvoice)).toEqual({
      invoiceNumber: "SF177",
      institutionName: "SEDARTE IPS SAS",
      type: "SEDARTE",
      serviceDate: "2026-10-05",
      invoiceDate: "2026-10-05",
      expectedPaymentDate: "2026-10-05",
      pdfTotalAmount: 800,
      items: [
        {
          description: "SERVICIOS ANESTESIOLOGIA - 02/10/2026 14:30",
          quantity: 1,
          unitAmount: 800,
          discountAmount: 0,
        },
      ],
    })
  })

  it("parses multiple items and their line discounts", () => {
    const text = `
      No. FV 204
      Señores SOMA IPS SAS
      Expedición 06/10/2026, 09:10
      Ítem Descripción Cantidad Vr. Unitario Vr. Bruto Valor desc. Vr. Total
      1 SERVICIO A - 31/08/2026 08:00 1.00 400,000.00 400,000.00 10,000.00 390,000.00
      2 SERVICIO B - 1/09/2026 08:00 2.00 200,000.00 400,000.00 0.00 400,000.00
      Total a Pagar 790,000.00
    `

    expect(parseInvoicePdfText(text)).toMatchObject({
      invoiceNumber: "FV204",
      type: null,
      serviceDate: "2026-10-06",
      invoiceDate: "2026-10-06",
      expectedPaymentDate: null,
      pdfTotalAmount: 790,
      items: [
        { description: "SERVICIO A - 31/08/2026 08:00", quantity: 1, unitAmount: 400, discountAmount: 10 },
        { description: "SERVICIO B - 1/09/2026 08:00", quantity: 2, unitAmount: 200, discountAmount: 0 },
      ],
    })
  })

  it("parses an expiration date split into separate PDF fragments", () => {
    const text = oneItemInvoice.replace("Vencimiento 05/10/2026", "Vencimiento\n31 / 01 / 2028")

    expect(parseInvoicePdfText(text).expectedPaymentDate).toBe("2028-01-31")
  })

  it("converts ordinary COP pesos to app thousands for a fully discounted SOMA POS invoice", () => {
    const text = `
      No. SF 174
      Señores SOCIEDAD MEDICA ANTIOQUENA SA
      Generación 30/09/2026, 05:39
      Expedición 30/09/2026, 05:39
      Vencimiento 29/12/2026
      1 SERVICIOS ANESTESIOLOGIA POS 1.00 47,445,123.00 47,445,123.00 16,824,665.00 30,620,458.00
      Total a Pagar 30,620,458.00
    `

    expect(parseInvoicePdfText(text)).toMatchObject({
      invoiceNumber: "SF174",
      type: "SOMA_POS",
      serviceDate: "2026-09-30",
      invoiceDate: "2026-09-30",
      expectedPaymentDate: "2026-12-29",
      pdfTotalAmount: 30620.458,
      items: [{ description: "SERVICIOS ANESTESIOLOGIA POS", unitAmount: 47445.123, discountAmount: 16824.665 }],
    })
  })

  it("parses a three-item Sedarte invoice with unpadded service dates", () => {
    const text = `
      No. SF 171
      Señores SEDARTE IPS SAS
      Generación 02/09/2026, 15:34
      Expedición 02/09/2026, 15:34
      Vencimiento 02/09/2026
      1 SERVICIOS ANESTESIOLOGIA - 31/08/2026 11:30 1.00 350,000.00 350,000.00 0.00 350,000.00
      2 SERVICIOS ANESTESIOLOGIA - 1/09/2026 14:00 1.00 350,000.00 350,000.00 0.00 350,000.00
      3 SERVICIOS ANESTESIOLOGIA - 1/09/2026 16:00 1.00 1,000,000.00 1,000,000.00 0.00 1,000,000.00
      Total a Pagar 1,700,000.00
    `

    const imported = parseInvoicePdfText(text)

    expect(imported).toMatchObject({
      invoiceNumber: "SF171",
      type: "SEDARTE",
      serviceDate: "2026-09-02",
      invoiceDate: "2026-09-02",
      expectedPaymentDate: "2026-09-02",
      pdfTotalAmount: 1700,
    })
    expect(imported.items).toHaveLength(3)
    expect(imported.items.map((item) => item.unitAmount)).toEqual([350, 350, 1000])
  })

  it("rejects documents without recognizable invoice lines", () => {
    expect(() => parseInvoicePdfText("Factura electronica de venta\nNo. SF 177")).toThrow(/partidas/i)
  })

  it("rejects invoice lines without a final PDF total rather than applying automatic discounts", () => {
    const text = `
      No. SF 200
      Señores SOMA IPS SAS
      1 SERVICIOS ANESTESIOLOGIA POS 1.00 1,000,000.00 1,000,000.00 100,000.00 900,000.00
    `

    expect(() => parseInvoicePdfText(text)).toThrow(/total a pagar/i)
  })

  it("parses a credit note changing payment terms without treating it as an invoice cancellation", () => {
    const text = `
      Alejandro Botero
      Nota Crédito No. 2-3
      Fecha Nota Crédito 2026-10-30
      Factura de Venta SF-181
      Señores SOCIEDAD MEDICA ANTIOQUEÑA SA
      1 SERVICIOS ANESTESIOLOGIA POS - OCTUBRE 2026 1.00 25,939,738.00
      Total Bruto 42,709,929.00
      Descuentos 16,770,191.00
      Total 25,939,738.00
      Observaciones: Cambio de forma de pago
      CUDE: 123abc
    `

    expect(parseCreditNotePdfText(text)).toEqual({
      creditNoteNumber: "2-3",
      originalInvoiceNumber: "SF-181",
      creditNoteDate: "2026-10-30",
      reason: "Cambio de forma de pago",
      amount: 25939.738,
    })
    expect(() => parseInvoicePdfText(text)).toThrow(/nota crédito/i)
  })

  it("parses credit-note identifiers and total split across PDF lines", () => {
    const text = `
      Nota Crédito
      No. 2- 3
      Fecha Nota Crédito 2026-10-30
      Factura de Venta
      SF - 181
      Total items: 1
      Total Bruto 42,709,929.00
      Total
      25,939,738.00
      Observaciones: Cambio de forma de pago
    `

    expect(parseCreditNotePdfText(text)).toMatchObject({
      creditNoteNumber: "2-3",
      originalInvoiceNumber: "SF-181",
      amount: 25939.738,
    })
  })

  it("finds the final Total when the PDF places all summary amounts on one line", () => {
    const text = `
      Nota Crédito No. 2-3
      Factura de Venta SF-181
      Total items: 1 · Total Bruto 42,709,929.00 · Descuentos 16,770,191.00 · Subtotal 25,939,738.00 · IVA 0.00 · Total 25,939,738.00
    `

    expect(parseCreditNotePdfText(text)).toMatchObject({
      creditNoteNumber: "2-3",
      originalInvoiceNumber: "SF-181",
      amount: 25939.738,
    })
  })
})
