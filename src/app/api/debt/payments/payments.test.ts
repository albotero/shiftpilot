import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    debt: { findUnique: vi.fn() },
    parkingRate: { findUnique: vi.fn() },
    debtPayment: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    debtPaymentAllocation: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock.prisma }))

import { DELETE, GET, POST, PUT } from "./route"

const debt = {
  id: "debt-1",
  name: "Compra de acciones",
  schedule: [
    {
      id: "schedule-1",
      installment: 1,
      dueDate: new Date("2024-05-01T00:00:00.000Z"),
      previousBalance: 1000,
      monthlyInterest: 100,
      paymentAmount: 1000,
      principalAmount: 900,
      interestAmount: 100,
      remainingBalance: 100,
    },
    {
      id: "schedule-2",
      installment: 2,
      dueDate: new Date("2024-06-01T00:00:00.000Z"),
      previousBalance: 100,
      monthlyInterest: 80,
      paymentAmount: 1000,
      principalAmount: 920,
      interestAmount: 80,
      remainingBalance: 0,
    },
  ],
  payments: [],
}

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/debt/payments", {
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
  prismaMock.prisma.debt.findUnique.mockResolvedValue(debt)
  prismaMock.prisma.parkingRate.findUnique.mockResolvedValue({ year: 2026, amount: 150 })
  prismaMock.prisma.debtPayment.create.mockResolvedValue({
    id: "payment-1",
    debtId: debt.id,
    paidAt: new Date("2026-07-11T00:00:00.000Z"),
    amount: 500,
    parkingAmount: 150,
    notes: "Transferencia",
  })
  prismaMock.prisma.debtPayment.delete.mockResolvedValue({})
  prismaMock.prisma.debtPayment.update.mockResolvedValue({})
  prismaMock.prisma.debtPaymentAllocation.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.prisma.debtPaymentAllocation.createMany.mockResolvedValue({ count: 1 })
})

describe("debt payment routes", () => {
  it("records a payment, keeps parking separate, and persists FIFO allocation by payment", async () => {
    const response = await POST(
      jsonRequest({ paidAt: "2026-07-11", amount: 500, parkingAmount: 150, notes: "Transferencia" }),
    )
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.summary).toMatchObject({
      scheduledAmount: 2000,
      balanceAmount: 1500,
      paymentsApplied: 500,
      parkingPaid: 150,
      interestPaid: 100,
      principalPaid: 400,
    })
    expect(result.payments).toMatchObject([
      {
        id: "payment-1",
        amount: 500,
        parkingAmount: 150,
        allocations: [
          {
            installment: 1,
            dueDate: "2024-05-01",
            interestAmount: 100,
            principalAmount: 400,
            unclassifiedAmount: 0,
          },
        ],
      },
    ])
    expect(prismaMock.prisma.debtPaymentAllocation.createMany).toHaveBeenCalledWith({
      data: [
        {
          paymentId: "payment-1",
          scheduleId: "schedule-1",
          principalAmount: 400,
          interestAmount: 100,
          unclassifiedAmount: 0,
        },
      ],
    })
  })

  it("returns the existing payment ledger", async () => {
    prismaMock.prisma.debt.findUnique.mockResolvedValue({
      ...debt,
      payments: [
        {
          id: "payment-seed",
          debtId: debt.id,
          paidAt: new Date("2026-07-11T00:00:00.000Z"),
          amount: 500,
          parkingAmount: 150,
          notes: "Pago inicial",
          createdAt: new Date("2026-07-11T00:00:00.000Z"),
        },
      ],
    })

    const response = await GET(new Request("http://localhost/api/debt/payments"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.payments).toMatchObject([
      {
        id: "payment-seed",
        paidAt: "2026-07-11",
        amount: 500,
        parkingAmount: 150,
        allocations: [{ installment: 1, dueDate: "2024-05-01" }],
      },
    ])
    expect(result.summary.balanceAmount).toBe(1500)
  })

  it("shows the overdue oldest installment remainder plus the current parking rate", async () => {
    prismaMock.prisma.debt.findUnique.mockResolvedValue({
      ...debt,
      payments: [
        {
          id: "partial-payment",
          debtId: debt.id,
          paidAt: new Date("2026-07-11T00:00:00.000Z"),
          amount: 500,
          parkingAmount: 150,
          notes: null,
          createdAt: new Date("2026-07-11T00:00:00.000Z"),
        },
      ],
    })

    const response = await GET(new Request("http://localhost/api/debt/payments?year=2026"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.nextInstallment).toMatchObject({
      installment: 1,
      dueDate: "2024-05-01",
      scheduledAmount: 1000,
      amount: 500,
      parkingAmount: 150,
      totalTransferAmount: 650,
    })
    expect(result.unpaidInstallments).toMatchObject([
      { installment: 1, remainingAmount: 500 },
      { installment: 2, remainingAmount: 1000 },
    ])
  })

  it("uses the parking rate for the requested payment year", async () => {
    prismaMock.prisma.parkingRate.findUnique.mockResolvedValueOnce({ year: 2027, amount: 175 })

    const response = await GET(new Request("http://localhost/api/debt/payments?year=2027"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.parkingRate.findUnique).toHaveBeenCalledWith({ where: { year: 2027 } })
    expect(result).toMatchObject({ parkingRateAmount: 175 })
    expect(result.nextInstallment.totalTransferAmount).toBe(result.nextInstallment.amount + 175)
  })

  it("allows one real payment to cover two FIFO installments", async () => {
    prismaMock.prisma.debtPayment.create.mockResolvedValueOnce({
      id: "payment-two-installments",
      debtId: debt.id,
      paidAt: new Date("2026-07-11T00:00:00.000Z"),
      amount: 1500,
      parkingAmount: 300,
      notes: null,
      createdAt: new Date("2026-07-11T00:00:00.000Z"),
    })

    const response = await POST(jsonRequest({ paidAt: "2026-07-11", amount: 1500, parkingAmount: 300 }))
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.payments[0].allocations).toMatchObject([
      { installment: 1, interestAmount: 100, principalAmount: 900 },
      { installment: 2, interestAmount: 80, principalAmount: 420 },
    ])
  })

  it("updates a real payment and recalculates its FIFO allocation", async () => {
    const existingPayment = {
      id: "payment-to-edit",
      debtId: debt.id,
      paidAt: new Date("2026-07-10T00:00:00.000Z"),
      amount: 500,
      parkingAmount: 150,
      notes: "Anterior",
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
    }
    const updatedPayment = {
      ...existingPayment,
      paidAt: new Date("2026-07-12T00:00:00.000Z"),
      amount: 900,
      parkingAmount: 175,
      notes: "Corregido",
    }
    prismaMock.prisma.debt.findUnique.mockResolvedValue({ ...debt, payments: [existingPayment] })
    prismaMock.prisma.debtPayment.update.mockResolvedValue(updatedPayment)

    const response = await PUT(
      jsonRequest(
        { id: existingPayment.id, paidAt: "2026-07-12", amount: 900, parkingAmount: 175, notes: "Corregido" },
        "PUT",
      ),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.debtPayment.update).toHaveBeenCalledWith({
      where: { id: existingPayment.id },
      data: {
        paidAt: new Date("2026-07-12T00:00:00.000Z"),
        amount: 900,
        parkingAmount: 175,
        notes: "Corregido",
      },
    })
    expect(result.summary).toMatchObject({ balanceAmount: 1100, paymentsApplied: 900, parkingPaid: 175 })
    expect(result.payments[0].allocations).toMatchObject([
      { installment: 1, interestAmount: 100, principalAmount: 800, unclassifiedAmount: 0 },
    ])
  })

  it("rejects an edited payment that exceeds the balance without updating it", async () => {
    prismaMock.prisma.debt.findUnique.mockResolvedValue({
      ...debt,
      payments: [
        {
          id: "payment-to-edit",
          debtId: debt.id,
          paidAt: new Date("2026-07-10T00:00:00.000Z"),
          amount: 500,
          parkingAmount: 0,
          notes: null,
          createdAt: new Date("2026-07-10T00:00:00.000Z"),
        },
      ],
    })

    const response = await PUT(
      jsonRequest({ id: "payment-to-edit", paidAt: "2026-07-12", amount: 2001, parkingAmount: 0 }, "PUT"),
    )

    expect(response.status).toBe(400)
    expect(prismaMock.prisma.debtPayment.update).not.toHaveBeenCalled()
  })

  it("rejects invalid dates and payments above the remaining scheduled balance", async () => {
    const invalidDate = await POST(jsonRequest({ paidAt: "2026-02-30", amount: 10, parkingAmount: 0 }))
    const overpayment = await POST(jsonRequest({ paidAt: "2026-07-11", amount: 2001, parkingAmount: 0 }))

    expect(invalidDate.status).toBe(400)
    expect(overpayment.status).toBe(400)
    expect(prismaMock.prisma.debtPayment.create).not.toHaveBeenCalled()
  })

  it("reallocates the remaining payments after one payment is deleted", async () => {
    prismaMock.prisma.debt.findUnique.mockResolvedValue({
      ...debt,
      payments: [
        {
          id: "payment-first",
          debtId: debt.id,
          paidAt: new Date("2024-05-05T00:00:00.000Z"),
          amount: 500,
          parkingAmount: 0,
          notes: null,
          createdAt: new Date("2024-05-05T00:00:00.000Z"),
        },
        {
          id: "payment-second",
          debtId: debt.id,
          paidAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: 500,
          parkingAmount: 0,
          notes: null,
          createdAt: new Date("2024-06-05T00:00:00.000Z"),
        },
      ],
    })

    const response = await DELETE(jsonRequest({ id: "payment-first" }, "DELETE"))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.prisma.debtPayment.delete).toHaveBeenCalledWith({ where: { id: "payment-first" } })
    expect(result.payments).toMatchObject([{ id: "payment-second", allocations: [{ installment: 1 }] }])
    expect(prismaMock.prisma.debtPaymentAllocation.createMany).toHaveBeenCalledWith({
      data: [
        {
          paymentId: "payment-second",
          scheduleId: "schedule-1",
          principalAmount: 400,
          interestAmount: 100,
          unclassifiedAmount: 0,
        },
      ],
    })
  })
})
