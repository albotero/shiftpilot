import { Prisma } from "@prisma/client"
import { z } from "zod"
import {
  calculateInvoiceAmounts,
  getExpectedPaymentDate,
  getInvoicePaymentDays,
  invoiceMutationSchema,
} from "@/lib/billing/invoice-service"
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from "@/lib/billing/calculations"
import { addMoney, assertMoneyAmount } from "@/lib/money/integer"
import { recalculateSocialSecurityPeriod } from "@/lib/social-security/period"
import { getMinimumWageForYear, type MinimumWageSnapshot } from "@/lib/social-security/minimum-wage"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

type InvoiceMutation = z.infer<typeof invoiceMutationSchema>
type InvoiceWithItems = Prisma.InvoiceGetPayload<{ include: { items: true } }>
type InvoiceRequestResult = { data: InvoiceMutation } | { response: Response }
type BillingSettingsDatabase = Pick<Prisma.TransactionClient, "appSetting">

function dateKey(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null
}

function mapInvoice(invoice: InvoiceWithItems) {
  return {
    id: invoice.id,
    type: invoice.type,
    serviceDate: dateKey(invoice.serviceDate),
    invoiceDate: dateKey(invoice.invoiceDate),
    invoiceNumber: invoice.invoiceNumber,
    expectedPaymentDate: dateKey(invoice.expectedPaymentDate),
    pdfTotalAmount: invoice.pdfTotalAmount === null ? null : Number(invoice.pdfTotalAmount),
    grossAmount: Number(invoice.grossAmount),
    discountAmount: Number(invoice.discountAmount),
    shiftDiscountAmount: Number(invoice.shiftDiscountAmount),
    netAmount: Number(invoice.netAmount),
    privateShiftCount: invoice.privateShiftCount,
    privateShiftAmount: Number(invoice.privateShiftAmount),
    status: invoice.status,
    paidAt: dateKey(invoice.paidAt),
    notes: invoice.notes,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitAmount: Number(item.unitAmount),
      discountAmount: Number(item.discountAmount),
      grossAmount: Number(item.grossAmount),
    })),
  }
}

async function getBillingSettings(database: BillingSettingsDatabase = prisma) {
  const records = await database.appSetting.findMany({ where: { key: { startsWith: "billing." } } })
  const values: Record<string, number> = {}
  for (const record of records) {
    if (typeof record.value !== "number" || record.value < 0) continue
    if (record.key === "billing.particular.shiftAmount") {
      try {
        assertMoneyAmount(record.value)
      } catch {
        continue
      }
    } else if (!Number.isSafeInteger(record.value)) continue
    values[record.key] = record.value
  }
  const setting = (key: string, fallback: number) => values[key] ?? fallback
  const calculationSettings: BillingSettings = {
    posDiscountRatePpm: setting("billing.pos.discountPpm", DEFAULT_BILLING_SETTINGS.posDiscountRatePpm),
    prepaidDiscountRatePpm: setting("billing.prepaid.discountPpm", DEFAULT_BILLING_SETTINGS.prepaidDiscountRatePpm),
    particularDiscountRatePpm: setting(
      "billing.particular.discountPpm",
      DEFAULT_BILLING_SETTINGS.particularDiscountRatePpm,
    ),
    privateShiftAmount: setting("billing.particular.shiftAmount", DEFAULT_BILLING_SETTINGS.privateShiftAmount),
  }
  return { values, calculationSettings }
}

async function buildInvoiceData(
  input: InvoiceMutation,
  workId: string,
  replaceItems: boolean,
  database: BillingSettingsDatabase = prisma,
) {
  const settings = await getBillingSettings(database)
  const totals = calculateInvoiceAmounts(input, settings.calculationSettings)
  const dueDate = getExpectedPaymentDate(
    input.serviceDate,
    input.invoiceDate,
    getInvoicePaymentDays(input.type, settings.values),
  )

  return {
    workId,
    type: input.type,
    serviceDate: new Date(`${input.serviceDate}T00:00:00.000Z`),
    invoiceDate: input.invoiceDate ? new Date(`${input.invoiceDate}T00:00:00.000Z`) : null,
    invoiceNumber: input.invoiceNumber || null,
    expectedPaymentDate: new Date(`${input.expectedPaymentDate ?? dueDate}T00:00:00.000Z`),
    pdfTotalAmount: input.pdfTotalAmount ?? null,
    grossAmount: totals.grossAmount,
    discountAmount: totals.discountAmount,
    shiftDiscountAmount: totals.shiftDiscountAmount,
    netAmount: totals.netAmount,
    privateShiftCount: input.type === "SOMA_PARTICULAR" ? (input.privateShiftCount ?? 0) : 0,
    privateShiftAmount: totals.privateShiftAmount,
    status: input.status,
    paidAt: input.paidAt ? new Date(`${input.paidAt}T00:00:00.000Z`) : null,
    notes: input.notes || null,
    items: {
      ...(replaceItems ? { deleteMany: {} } : {}),
      create: totals.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        discountAmount: item.discountAmount ?? 0,
        grossAmount: item.grossAmount,
      })),
    },
  }
}

async function parseInvoiceRequest(request: Request): Promise<InvoiceRequestResult> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { response: Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 }) }
  }
  const parsed = invoiceMutationSchema.safeParse(body)
  if (!parsed.success) {
    return { response: Response.json({ error: "Factura inválida", details: parsed.error.flatten() }, { status: 400 }) }
  }
  return { data: parsed.data }
}

async function getWorkId(type: InvoiceMutation["type"]) {
  const work = await prisma.work.findUnique({ where: { name: type === "SEDARTE" ? "Sedarte" : "Soma" } })
  return work?.id
}

function isMissingRecord(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025"
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month")
  const includeMeta = new URL(request.url).searchParams.get("includeMeta") === "true"
  let where: Prisma.InvoiceWhereInput = {}
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Mes inválido" }, { status: 400 })
    const [year, monthNumber] = month.split("-").map(Number)
    if (year < 1900 || year > 9998 || monthNumber < 1 || monthNumber > 12) {
      return Response.json({ error: "Mes inválido" }, { status: 400 })
    }
    where = {
      serviceDate: {
        gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
        lt: new Date(Date.UTC(year, monthNumber, 1)),
      },
    }
  }

  try {
    const [records, settings] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { items: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
      }),
      includeMeta ? getBillingSettings() : Promise.resolve(null),
    ])
    const invoices = records.map(mapInvoice)
    if (!settings) return Response.json(invoices)

    return Response.json({
      invoices,
      calculationSettings: settings.calculationSettings,
      paymentDays: {
        SOMA_POS: getInvoicePaymentDays("SOMA_POS", settings.values),
        SOMA_PREPAGADA: getInvoicePaymentDays("SOMA_PREPAGADA", settings.values),
        SOMA_PARTICULAR: getInvoicePaymentDays("SOMA_PARTICULAR", settings.values),
        SEDARTE: getInvoicePaymentDays("SEDARTE", settings.values),
      },
      summary: {
        count: invoices.length,
        netAmount: addMoney(...invoices.map((invoice) => invoice.netAmount)),
      },
    })
  } catch {
    return Response.json({ error: "No se pudieron consultar las facturas" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const parsed = await parseInvoiceRequest(request)
  if ("response" in parsed) return parsed.response
  try {
    const workId = await getWorkId(parsed.data.type)
    if (!workId) return Response.json({ error: "No se encontró el centro de trabajo" }, { status: 409 })
    const minimumWage = await getMinimumWageForYear(prisma, Number(parsed.data.serviceDate.slice(0, 4)))
    const invoice = await prisma.$transaction(async (transaction) => {
      const created = await transaction.invoice.create({
        data: await buildInvoiceData(parsed.data, workId, false, transaction),
        include: { items: true },
      })
      await recalculateSocialSecurityPeriod(transaction, parsed.data.serviceDate.slice(0, 7), minimumWage)
      return created
    })
    return Response.json(mapInvoice(invoice), { status: 201 })
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "No se pudo guardar la factura" },
      { status: error instanceof RangeError ? 400 : 503 },
    )
  }
}

export async function PATCH(request: Request) {
  const parsed = await parseInvoiceRequest(request)
  if ("response" in parsed) return parsed.response
  if (!parsed.data.id) return Response.json({ error: "Falta el identificador de la factura" }, { status: 400 })

  try {
    const workId = await getWorkId(parsed.data.type)
    if (!workId) return Response.json({ error: "No se encontró el centro de trabajo" }, { status: 409 })
    const currentInvoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.id },
      select: { serviceDate: true },
    })
    if (!currentInvoice) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    const oldMonth = currentInvoice.serviceDate.toISOString().slice(0, 7)
    const newMonth = parsed.data.serviceDate.slice(0, 7)
    const affectedMonths = new Set([oldMonth, newMonth])
    const minimumWages = new Map<string, MinimumWageSnapshot>()
    for (const month of affectedMonths) {
      minimumWages.set(month, await getMinimumWageForYear(prisma, Number(month.slice(0, 4))))
    }
    const invoice = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.invoice.findUnique({
        where: { id: parsed.data.id },
        select: { serviceDate: true },
      })
      if (!existing) return null
      const updated = await transaction.invoice.update({
        where: { id: parsed.data.id },
        data: await buildInvoiceData(parsed.data, workId, true, transaction),
        include: { items: true },
      })
      for (const month of affectedMonths) {
        await recalculateSocialSecurityPeriod(transaction, month, minimumWages.get(month)!)
      }
      return updated
    })
    if (!invoice) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    return Response.json(mapInvoice(invoice))
  } catch (error) {
    if (isMissingRecord(error)) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    return Response.json(
      { error: error instanceof RangeError ? error.message : "No se pudo actualizar la factura" },
      { status: error instanceof RangeError ? 400 : 503 },
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
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return Response.json({ error: "Identificador inválido" }, { status: 400 })

  try {
    const currentInvoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.id },
      select: { serviceDate: true },
    })
    if (!currentInvoice) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    const month = currentInvoice.serviceDate.toISOString().slice(0, 7)
    const minimumWage = await getMinimumWageForYear(prisma, Number(month.slice(0, 4)))
    const deleted = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.invoice.findUnique({
        where: { id: parsed.data.id },
        select: { serviceDate: true },
      })
      if (!existing) return false
      await transaction.invoice.delete({ where: { id: parsed.data.id } })
      await recalculateSocialSecurityPeriod(transaction, month, minimumWage)
      return true
    })
    if (!deleted) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    return Response.json({ deleted: true, id: parsed.data.id })
  } catch (error) {
    if (isMissingRecord(error)) return Response.json({ error: "No se encontró la factura" }, { status: 404 })
    return Response.json({ error: "No se pudo eliminar la factura" }, { status: 503 })
  }
}
