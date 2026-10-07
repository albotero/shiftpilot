import { z } from "zod"
import { buildMonthlyReport } from "@/lib/reports/monthly"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/)

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  if (year < 1900 || year > 9998 || monthNumber < 1 || monthNumber > 12) return null
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  }
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month")
  if (!month || !monthSchema.safeParse(month).success) {
    return Response.json({ error: "Mes inválido" }, { status: 400 })
  }
  const range = getMonthRange(month)
  if (!range) return Response.json({ error: "Mes inválido" }, { status: 400 })

  try {
    const [shifts, invoices, socialSecurity, debt] = await Promise.all([
      prisma.shift.findMany({
        where: { date: { gte: range.start, lt: range.end } },
        select: { status: true, period: true, durationHours: true, coverages: { select: { id: true } } },
      }),
      prisma.invoice.findMany({
        where: { serviceDate: { gte: range.start, lt: range.end } },
        select: { netAmount: true },
      }),
      prisma.socialSecurityPeriod.findUnique({
        where: { month: range.start },
        select: {
          grossAmount: true,
          discounts: true,
          netAmount: true,
          ibcAmount: true,
          healthAmount: true,
          pensionAmount: true,
          arlAmount: true,
          fundAmount: true,
          solidarityAmount: true,
          totalAmount: true,
        },
      }),
      prisma.debt.findUnique({
        where: { name: "Compra de acciones" },
        select: {
          schedule: {
            where: { dueDate: { gte: range.start, lt: range.end } },
            select: { paymentAmount: true },
          },
          payments: {
            where: { paidAt: { gte: range.start, lt: range.end } },
            select: { amount: true, parkingAmount: true },
          },
        },
      }),
    ])

    return Response.json(
      buildMonthlyReport({
        month,
        shifts: shifts.map((shift) => ({
          status: shift.status,
          period: shift.period,
          durationHours: shift.durationHours,
          coverageCount: shift.coverages.length,
        })),
        invoices: invoices.map((invoice) => ({ netAmount: Number(invoice.netAmount) })),
        socialSecurity: socialSecurity
          ? {
              grossAmount: Number(socialSecurity.grossAmount),
              discounts: Number(socialSecurity.discounts),
              netAmount: Number(socialSecurity.netAmount),
              ibcAmount: Number(socialSecurity.ibcAmount),
              healthAmount: Number(socialSecurity.healthAmount),
              pensionAmount: Number(socialSecurity.pensionAmount),
              arlAmount: Number(socialSecurity.arlAmount),
              fundAmount: Number(socialSecurity.fundAmount),
              solidarityAmount: Number(socialSecurity.solidarityAmount),
              totalAmount: Number(socialSecurity.totalAmount),
            }
          : null,
        debtSchedule: debt?.schedule.map((line) => ({ paymentAmount: Number(line.paymentAmount) })) ?? [],
        debtPayments:
          debt?.payments.map((payment) => ({
            amount: Number(payment.amount),
            parkingAmount: Number(payment.parkingAmount),
          })) ?? [],
      }),
    )
  } catch {
    return Response.json({ error: "No se pudo generar el reporte mensual" }, { status: 503 })
  }
}
