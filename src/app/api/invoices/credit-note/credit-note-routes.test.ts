import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    appSetting: { findMany: vi.fn() },
    socialSecurityPeriod: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock.prisma }))

import { DELETE, PATCH, POST } from "./route"

const originalInvoice = {
  id: "invoice-original",
  invoiceNumber: "SF181",
  serviceDate: new Date("2026-10-01T00:00:00.000Z"),
  pdfTotalAmount: 1000,
  grossAmount: 1200,
  discountAmount: 200,
  shiftDiscountAmount: 0,
  netAmount: 1000,
  status: "FACTURADA",
  includeInIbc: true,
  creditNotes: [],
  items: [],
}
let storedInvoice = originalInvoice

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/invoices/credit-note", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  storedInvoice = originalInvoice
  prismaMock.prisma.$transaction.mockImplementation(
    async (operation: (transaction: typeof prismaMock.prisma) => Promise<unknown>) => operation(prismaMock.prisma),
  )
  prismaMock.prisma.invoice.findMany.mockImplementation(async () => [storedInvoice])
  prismaMock.prisma.invoice.findUnique.mockImplementation(async () => storedInvoice)
  prismaMock.prisma.invoice.update.mockImplementation(async ({ data }: { data: Partial<typeof originalInvoice> }) => {
    storedInvoice = { ...storedInvoice, ...data }
    return storedInvoice
  })
  prismaMock.prisma.appSetting.findMany.mockResolvedValue([])
  prismaMock.prisma.socialSecurityPeriod.findUnique.mockResolvedValue(null)
  prismaMock.prisma.socialSecurityPeriod.upsert.mockImplementation(
    async ({ create, update }: { create: object; update: object }) => ({
      ...create,
      ...update,
    }),
  )
})

describe("credit note route", () => {
  it("annuls only when the note amount equals the original net, regardless of observation", async () => {
    const response = await POST(
      request({
        creditNoteNumber: "2-3",
        originalInvoiceNumber: "SF-181",
        creditNoteDate: "2026-10-30",
        reason: "Cambio de forma de pago",
        amount: 1000,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "ANULADA", action: "ANULACION" })
    expect(prismaMock.prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ANULADA",
          includeInIbc: false,
          creditNotes: [expect.objectContaining({ action: "ANULACION", originalAmount: 1000 })],
        }),
      }),
    )
  })

  it("reduces the original invoice and marks it modified when the credit amount differs, regardless of observation", async () => {
    const response = await POST(
      request({
        creditNoteNumber: "NC-19",
        originalInvoiceNumber: "SF181",
        creditNoteDate: null,
        reason: "Anulación total de la factura",
        amount: 200,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "FACTURADA", action: "MODIFICACION" })
    expect(prismaMock.prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          netAmount: 800,
          pdfTotalAmount: 800,
          discountAmount: 400,
          creditNotes: [expect.objectContaining({ action: "MODIFICACION", resultingAmount: 800 })],
        }),
      }),
    )
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalled()
  })

  it("rejects a credit note larger than the original net", async () => {
    const response = await POST(
      request({
        creditNoteNumber: "NC-20",
        originalInvoiceNumber: "SF181",
        creditNoteDate: null,
        reason: "Ajuste",
        amount: 1000.001,
      }),
    )

    expect(response.status).toBe(409)
    expect(prismaMock.prisma.invoice.update).not.toHaveBeenCalled()
  })

  it("edits and deletes an applied note while restoring the invoice and IBC", async () => {
    const created = await POST(
      request({
        creditNoteNumber: "NC-EDIT",
        originalInvoiceNumber: "SF181",
        creditNoteDate: "2026-10-30",
        reason: "Ajuste",
        amount: 200,
      }),
    )
    expect(created.status).toBe(200)
    expect(storedInvoice.netAmount).toBe(800)

    const edited = await PATCH(
      request(
        {
          invoiceId: originalInvoice.id,
          creditNoteNumber: "NC-EDIT",
          creditNoteDate: "2026-10-31",
          reason: "Valor corregido",
          amount: 300,
        },
        "PATCH",
      ),
    )
    expect(edited.status).toBe(200)
    expect(storedInvoice.netAmount).toBe(700)
    expect(storedInvoice.discountAmount).toBe(500)
    expect(storedInvoice.creditNotes).toMatchObject([{ reason: "Valor corregido", amount: 300, resultingAmount: 700 }])

    const deleted = await DELETE(request({ invoiceId: originalInvoice.id, creditNoteNumber: "NC-EDIT" }, "DELETE"))
    expect(deleted.status).toBe(200)
    expect(storedInvoice).toMatchObject({
      netAmount: 1000,
      discountAmount: 200,
      pdfTotalAmount: 1000,
      includeInIbc: true,
      status: "FACTURADA",
      creditNotes: [],
    })
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledTimes(3)
  })
})
