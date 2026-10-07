import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { calculateDebtSummary, calculatePaymentAllocationsByPayment } from "@/lib/debt/calculations"
import { addMoney, assertMoneyAmount, subtractMoney } from "@/lib/money/integer"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

type DebtDatabase = Pick<Prisma.TransactionClient, "debt" | "debtPayment" | "debtPaymentAllocation" | "parkingRate">

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const createPaymentSchema = z
  .object({
    paidAt: z.string().refine(validDateKey),
    amount: z.number().finite().nonnegative(),
    parkingAmount: z.number().finite().nonnegative().default(0),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((payment) => payment.amount > 0 || payment.parkingAmount > 0)

const deletePaymentSchema = z.object({ id: z.string().min(1) })

async function findDebt(database: DebtDatabase) {
  return database.debt.findUnique({
    where: { name: "Compra de acciones" },
    include: {
      schedule: { orderBy: { installment: "asc" } },
      payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }] },
    },
  })
}

type DebtRecord = NonNullable<Awaited<ReturnType<typeof findDebt>>>

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getTodayInColombia() {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`
}

function validParkingYear(value: string | null) {
  if (!value || !/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return year >= 1900 && year <= 9998 ? year : null
}

function toScheduleLines(debt: DebtRecord) {
  return debt.schedule.map((line) => ({
    installment: line.installment,
    dueDate: dateKey(line.dueDate),
    previousBalance: Number(line.previousBalance),
    monthlyInterest: Number(line.monthlyInterest),
    paymentAmount: Number(line.paymentAmount),
    principalAmount: Number(line.principalAmount),
    interestAmount: Number(line.interestAmount),
    remainingBalance: Number(line.remainingBalance),
  }))
}

function toPaymentLines(debt: DebtRecord) {
  return [...debt.payments]
    .sort(
      (left, right) =>
        left.paidAt.getTime() - right.paidAt.getTime() || left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .map((payment) => ({
      id: payment.id,
      paidAt: dateKey(payment.paidAt),
      amount: Number(payment.amount),
      parkingAmount: Number(payment.parkingAmount),
      notes: payment.notes,
    }))
}

async function buildDebtLedger(
  database: DebtDatabase,
  debt: DebtRecord,
  parkingRateYear = Number(getTodayInColombia().slice(0, 4)),
) {
  const schedule = toScheduleLines(debt)
  const payments = toPaymentLines(debt)
  const allocations = calculatePaymentAllocationsByPayment(schedule, payments)
  const paidByInstallment = new Map<number, number>()
  for (const allocation of allocations) {
    const paid = paidByInstallment.get(allocation.installment) ?? 0
    paidByInstallment.set(
      allocation.installment,
      addMoney(paid, allocation.interestAmount, allocation.principalAmount, allocation.unclassifiedAmount),
    )
  }
  const unpaidInstallments = schedule
    .map((line) => ({
      installment: line.installment,
      dueDate: line.dueDate,
      scheduledAmount: line.paymentAmount,
      remainingAmount: Math.max(0, subtractMoney(line.paymentAmount, paidByInstallment.get(line.installment) ?? 0)),
      principalAmount: line.principalAmount,
      interestAmount: line.interestAmount,
    }))
    .filter((line) => line.remainingAmount > 0)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.installment - right.installment)
  const scheduleByInstallment = new Map(schedule.map((line) => [line.installment, line]))
  const allocationsByPayment = new Map<
    string,
    (Omit<(typeof allocations)[number], "paymentId"> & { dueDate: string })[]
  >()
  for (const { paymentId, ...allocation } of allocations) {
    const scheduleLine = scheduleByInstallment.get(allocation.installment)
    if (!scheduleLine) throw new Error("No se encontró la cuota de una asignación")
    const current = allocationsByPayment.get(paymentId) ?? []
    current.push({ ...allocation, dueDate: scheduleLine.dueDate })
    allocationsByPayment.set(paymentId, current)
  }
  const summary = calculateDebtSummary(schedule, payments, getTodayInColombia())
  const parkingRate = await database.parkingRate.findUnique({ where: { year: parkingRateYear } })
  const parkingRateAmount = Number(parkingRate?.amount ?? 0)
  const nextInstallment = unpaidInstallments[0]

  return {
    summary,
    parkingRateAmount,
    unpaidInstallments,
    nextInstallment: nextInstallment
      ? {
          installment: nextInstallment.installment,
          dueDate: nextInstallment.dueDate,
          scheduledAmount: nextInstallment.scheduledAmount,
          amount: nextInstallment.remainingAmount,
          parkingAmount: parkingRateAmount,
          totalTransferAmount: addMoney(nextInstallment.remainingAmount, parkingRateAmount),
          principalAmount: nextInstallment.principalAmount,
          interestAmount: nextInstallment.interestAmount,
        }
      : null,
    payments: payments.map((payment) => ({
      ...payment,
      allocations: allocationsByPayment.get(payment.id) ?? [],
    })),
  }
}

async function savePaymentAllocations(database: DebtDatabase, debt: DebtRecord) {
  const payments = toPaymentLines(debt)
  const paymentIds = payments.map((payment) => payment.id)
  if (paymentIds.length === 0) return

  await database.debtPaymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } })

  const scheduleIds = new Map(debt.schedule.map((line) => [line.installment, line.id]))
  const allocations = calculatePaymentAllocationsByPayment(toScheduleLines(debt), payments)
  const records = allocations.map((allocation) => {
    const scheduleId = scheduleIds.get(allocation.installment)
    if (!scheduleId) throw new Error("No se encontró la cuota de una asignación")
    return {
      paymentId: allocation.paymentId,
      scheduleId,
      principalAmount: allocation.principalAmount,
      interestAmount: allocation.interestAmount,
      unclassifiedAmount: allocation.unclassifiedAmount,
    }
  })
  if (records.length > 0) await database.debtPaymentAllocation.createMany({ data: records })
}

async function parseJson(request: Request) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown }
  } catch {
    return { ok: false as const, response: Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 }) }
  }
}

export async function GET(request: Request) {
  const yearParameter = new URL(request.url).searchParams.get("year")
  const parkingYear =
    yearParameter === null ? Number(getTodayInColombia().slice(0, 4)) : validParkingYear(yearParameter)
  if (parkingYear === null) return Response.json({ error: "Año de parqueadero inválido" }, { status: 400 })

  try {
    const debt = await findDebt(prisma)
    if (!debt) return Response.json({ error: "No se encontró el plan de deuda" }, { status: 404 })
    return Response.json(await buildDebtLedger(prisma, debt, parkingYear))
  } catch {
    return Response.json({ error: "No se pudo consultar el plan de pagos" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const parsedBody = await parseJson(request)
  if (!parsedBody.ok) return parsedBody.response
  const parsed = createPaymentSchema.safeParse(parsedBody.body)
  if (!parsed.success) return Response.json({ error: "Pago inválido" }, { status: 400 })
  try {
    assertMoneyAmount(parsed.data.amount)
    assertMoneyAmount(parsed.data.parkingAmount)
  } catch {
    return Response.json({ error: "Los importes admiten máximo tres decimales en miles de COP" }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const debt = await findDebt(transaction)
      if (!debt) return { status: 404, body: { error: "No se encontró el plan de deuda" } }

      const schedule = toScheduleLines(debt)
      const payments = toPaymentLines(debt)
      const currentSummary = calculateDebtSummary(schedule, payments, getTodayInColombia())
      if (parsed.data.amount > currentSummary.balanceAmount) {
        return { status: 400, body: { error: "El pago supera el saldo programado pendiente" } }
      }

      const payment = await transaction.debtPayment.create({
        data: {
          debtId: debt.id,
          paidAt: new Date(`${parsed.data.paidAt}T00:00:00.000Z`),
          amount: parsed.data.amount,
          parkingAmount: parsed.data.parkingAmount,
          notes: parsed.data.notes || null,
        },
      })
      const updatedDebt = { ...debt, payments: [...debt.payments, payment] }
      await savePaymentAllocations(transaction, updatedDebt)
      return {
        status: 201,
        body: await buildDebtLedger(transaction, updatedDebt, Number(parsed.data.paidAt.slice(0, 4))),
      }
    })
    return Response.json(result.body, { status: result.status })
  } catch {
    return Response.json({ error: "No se pudo guardar el pago" }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  const parsedBody = await parseJson(request)
  if (!parsedBody.ok) return parsedBody.response
  const parsed = deletePaymentSchema.safeParse(parsedBody.body)
  if (!parsed.success) return Response.json({ error: "Identificador de pago inválido" }, { status: 400 })

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const debt = await findDebt(transaction)
      if (!debt) return { status: 404, body: { error: "No se encontró el plan de deuda" } }
      const paymentToDelete = debt.payments.find((payment) => payment.id === parsed.data.id)
      if (!paymentToDelete) {
        return { status: 404, body: { error: "No se encontró el pago" } }
      }

      await transaction.debtPayment.delete({ where: { id: parsed.data.id } })
      const updatedDebt = { ...debt, payments: debt.payments.filter((payment) => payment.id !== parsed.data.id) }
      await savePaymentAllocations(transaction, updatedDebt)
      return {
        status: 200,
        body: {
          deleted: parsed.data.id,
          ...(await buildDebtLedger(transaction, updatedDebt, paymentToDelete.paidAt.getUTCFullYear())),
        },
      }
    })
    return Response.json(result.body, { status: result.status })
  } catch {
    return Response.json({ error: "No se pudo eliminar el pago" }, { status: 503 })
  }
}
