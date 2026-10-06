import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    work: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    socialSecurityPeriod: { upsert: vi.fn() },
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock.prisma }))

import { DELETE, GET, PATCH, POST } from "./route"

const settings = [
  { key: "billing.pos.paymentDays", value: 90 },
  { key: "billing.pos.discountPpm", value: 120_000 },
  { key: "billing.prepaid.paymentDays", value: 60 },
  { key: "billing.prepaid.discountPpm", value: 200_000 },
  { key: "billing.particular.paymentDays", value: 30 },
  { key: "billing.particular.discountPpm", value: 120_000 },
  { key: "billing.particular.shiftAmount", value: 685 },
  {
    key: "socialSecurity.minimumWageCop.2026",
    value: {
      year: 2026,
      amountCop: 1_750_905,
      sourceUrl: "https://www.mintrabajo.gov.co/test-2026",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
]

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/invoices", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.prisma.$transaction.mockImplementation(
    async (operation: (transaction: typeof prismaMock.prisma) => Promise<unknown>) => operation(prismaMock.prisma),
  )
  prismaMock.prisma.invoice.findMany.mockResolvedValue([])
  prismaMock.prisma.appSetting.findMany.mockResolvedValue(settings)
  prismaMock.prisma.socialSecurityPeriod.upsert.mockResolvedValue({})
  prismaMock.prisma.work.findUnique.mockImplementation(async ({ where }: { where: { name: string } }) => ({
    id: `${where.name.toLowerCase()}-work`,
    name: where.name,
  }))
})

describe("invoice routes", () => {
  it("creates a POS invoice with separate shift discount and due date", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([
      { grossAmount: 1000, discountAmount: 120, shiftDiscountAmount: 50, netAmount: 830 },
    ])
    prismaMock.prisma.invoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "invoice-pos",
      ...data,
      invoiceDate: new Date("2026-10-03T00:00:00.000Z"),
      expectedPaymentDate: new Date("2027-01-01T00:00:00.000Z"),
      items: [{ id: "item-pos", description: "Servicio", quantity: 1, unitAmount: 1000, grossAmount: 1000 }],
    }))

    const response = await POST(
      jsonRequest("POST", {
        type: "SOMA_POS",
        serviceDate: "2026-10-01",
        invoiceDate: "2026-10-03",
        status: "FACTURADA",
        shiftDiscountAmount: 50,
        items: [{ description: "Servicio", quantity: 1, unitAmount: 1000 }],
      }),
    )
    const invoice = await response.json()

    expect(response.status).toBe(201)
    expect(invoice).toMatchObject({
      grossAmount: 1000,
      discountAmount: 120,
      shiftDiscountAmount: 50,
      netAmount: 830,
      expectedPaymentDate: "2027-01-01",
      items: [{ description: "Servicio", grossAmount: 1000 }],
    })
    expect(prismaMock.prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workId: "soma-work",
          expectedPaymentDate: new Date("2027-01-01T00:00:00.000Z"),
          items: {
            create: [{ description: "Servicio", quantity: 1, unitAmount: 1000, discountAmount: 0, grossAmount: 1000 }],
          },
        }),
        include: { items: true },
      }),
    )
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { month: new Date("2026-10-01T00:00:00.000Z") },
        create: expect.objectContaining({
          grossAmount: 1000,
          discounts: 170,
          netAmount: 830,
          ibcAmount: 1_750.905,
        }),
      }),
    )
  })

  it("persists imported SOMA POS totals without recalculating PDF discounts", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([
      { grossAmount: 47445.123, discountAmount: 16824.665, shiftDiscountAmount: 0, netAmount: 30620.458 },
    ])
    prismaMock.prisma.invoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "invoice-imported",
      ...data,
      invoiceDate: new Date("2026-09-30T00:00:00.000Z"),
      expectedPaymentDate: new Date("2026-12-29T00:00:00.000Z"),
      items: [
        {
          id: "item-imported",
          description: "SERVICIOS ANESTESIOLOGIA POS",
          quantity: 1,
          unitAmount: 47445.123,
          discountAmount: 16824.665,
          grossAmount: 47445.123,
        },
      ],
    }))

    const response = await POST(
      jsonRequest("POST", {
        type: "SOMA_POS",
        serviceDate: "2026-09-30",
        invoiceDate: "2026-09-30",
        invoiceNumber: "SF174",
        expectedPaymentDate: "2026-12-29",
        pdfTotalAmount: 30620.458,
        status: "FACTURADA",
        items: [
          {
            description: "SERVICIOS ANESTESIOLOGIA POS",
            quantity: 1,
            unitAmount: 47445.123,
            discountAmount: 16824.665,
          },
        ],
      }),
    )
    const invoice = await response.json()

    expect(response.status).toBe(201)
    expect(invoice).toMatchObject({
      invoiceNumber: "SF174",
      expectedPaymentDate: "2026-12-29",
      pdfTotalAmount: 30620.458,
      grossAmount: 47445.123,
      discountAmount: 16824.665,
      shiftDiscountAmount: 0,
      netAmount: 30620.458,
      items: [{ unitAmount: 47445.123, discountAmount: 16824.665, grossAmount: 47445.123 }],
    })
    expect(prismaMock.prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: "SF174",
          expectedPaymentDate: new Date("2026-12-29T00:00:00.000Z"),
          pdfTotalAmount: 30620.458,
          items: {
            create: [
              expect.objectContaining({
                description: "SERVICIOS ANESTESIOLOGIA POS",
                unitAmount: 47445.123,
                discountAmount: 16824.665,
                grossAmount: 47445.123,
              }),
            ],
          },
        }),
      }),
    )
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { month: new Date("2026-09-01T00:00:00.000Z") },
        create: expect.objectContaining({
          grossAmount: 47445.123,
          discounts: 16824.665,
          netAmount: 30620.458,
          ibcAmount: 12248.183,
        }),
      }),
    )
  })

  it("filters invoice reads by service month", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([])
    const response = await GET(new Request("http://localhost/api/invoices?month=2026-10"))

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceDate: {
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lt: new Date("2026-11-01T00:00:00.000Z"),
          },
        },
      }),
    )
  })

  it("returns configured calculation settings and a summary for the billing dashboard", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([])

    const response = await GET(new Request("http://localhost/api/invoices?month=2026-10&includeMeta=true"))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      invoices: [],
      calculationSettings: {
        posDiscountRatePpm: 120_000,
        prepaidDiscountRatePpm: 200_000,
        particularDiscountRatePpm: 120_000,
        privateShiftAmount: 685,
      },
      paymentDays: { SOMA_POS: 90, SOMA_PREPAGADA: 60, SOMA_PARTICULAR: 30, SEDARTE: 0 },
      summary: { count: 0, netAmount: 0 },
    })
  })

  it("returns calculation settings, payment terms, and a monthly net summary", async () => {
    prismaMock.prisma.invoice.findMany.mockResolvedValue([])

    const response = await GET(new Request("http://localhost/api/invoices?month=2026-10&includeMeta=true"))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      invoices: [],
      calculationSettings: {
        posDiscountRatePpm: 120_000,
        prepaidDiscountRatePpm: 200_000,
        particularDiscountRatePpm: 120_000,
        privateShiftAmount: 685,
      },
      paymentDays: { SOMA_POS: 90, SOMA_PREPAGADA: 60, SOMA_PARTICULAR: 30, SEDARTE: 0 },
      summary: { count: 0, netAmount: 0 },
    })
  })

  it("replaces invoice items on update and deletes the invoice", async () => {
    prismaMock.prisma.invoice.findUnique.mockResolvedValue({ serviceDate: new Date("2026-09-07T00:00:00.000Z") })
    prismaMock.prisma.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "invoice-sedarte",
      ...data,
      invoiceDate: null,
      expectedPaymentDate: new Date("2026-10-07T00:00:00.000Z"),
      items: [{ id: "item-sedarte", description: "Procedimiento", quantity: 1, unitAmount: 1500, grossAmount: 1500 }],
    }))
    prismaMock.prisma.invoice.delete.mockResolvedValue({ id: "invoice-sedarte" })

    const response = await PATCH(
      jsonRequest("PATCH", {
        id: "invoice-sedarte",
        type: "SEDARTE",
        serviceDate: "2026-10-07",
        status: "PENDIENTE",
        notes: "Actualizada",
        items: [{ description: "Procedimiento", quantity: 1, unitAmount: 1500 }],
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { month: new Date("2026-09-01T00:00:00.000Z") } }),
    )
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { month: new Date("2026-10-01T00:00:00.000Z") } }),
    )
    expect(prismaMock.prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invoice-sedarte" },
        data: expect.objectContaining({ items: { deleteMany: {}, create: expect.any(Array) } }),
      }),
    )

    const deleted = await DELETE(jsonRequest("DELETE", { id: "invoice-sedarte" }))
    expect(deleted.status).toBe(200)
    expect(prismaMock.prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: "invoice-sedarte" } })
    expect(prismaMock.prisma.socialSecurityPeriod.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ where: { month: new Date("2026-09-01T00:00:00.000Z") } }),
    )
  })

  it("rejects invalid service-month filters", async () => {
    const response = await GET(new Request("http://localhost/api/invoices?month=2026-13"))

    expect(response.status).toBe(400)
    expect(prismaMock.prisma.invoice.findMany).not.toHaveBeenCalled()
  })
})
