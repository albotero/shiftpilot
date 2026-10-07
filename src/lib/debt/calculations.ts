import { addMoney, assertMoneyAmount, minMoney, subtractMoney } from "@/lib/money/integer"

export type DebtScheduleLine = {
  installment: number
  dueDate: string
  previousBalance: number
  monthlyInterest: number
  paymentAmount: number
  principalAmount: number
  interestAmount: number
  remainingBalance: number
}

export type DebtPayment = {
  paidAt: string
  amount: number
  parkingAmount: number
}

export type PaymentAllocation = {
  installment: number
  principalAmount: number
  interestAmount: number
  unclassifiedAmount: number
}

export type PaymentAllocationByPayment = PaymentAllocation & { paymentId: string; balanceAfterAmount: number }
export type IdentifiedDebtPayment = DebtPayment & { id: string }

export type DebtSummary = {
  scheduledAmount: number
  balanceAmount: number
  principalTotal: number
  principalPaid: number
  interestPaid: number
  unclassifiedPaid: number
  scheduleDifference: number
  paymentsApplied: number
  parkingPaid: number
  pendingInstallments: number[]
  nextInstallment: number | null
}

function validateSchedule(schedule: DebtScheduleLine[]) {
  for (const line of schedule) {
    assertMoneyAmount(line.previousBalance, "previousBalance")
    assertMoneyAmount(line.monthlyInterest, "monthlyInterest")
    assertMoneyAmount(line.paymentAmount, "paymentAmount")
    assertMoneyAmount(line.principalAmount, "principalAmount")
    assertMoneyAmount(line.interestAmount, "interestAmount")
    assertMoneyAmount(line.remainingBalance, "remainingBalance")
  }
}

export function calculateDebtInterest(schedule: DebtScheduleLine[]) {
  validateSchedule(schedule)
  return schedule.reduce((total, line) => total + line.monthlyInterest, 0)
}

export function calculatePaymentAllocationsByPayment(
  schedule: DebtScheduleLine[],
  payments: IdentifiedDebtPayment[],
): PaymentAllocationByPayment[] {
  validateSchedule(schedule)
  const outstanding = schedule
    .slice()
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.installment - right.installment)
    .map((line) => ({
      ...line,
      principalLeft: line.principalAmount,
      interestLeft: line.interestAmount,
      unclassifiedLeft: Math.max(0, subtractMoney(line.paymentAmount, line.principalAmount, line.interestAmount)),
    }))
  const allocations: PaymentAllocationByPayment[] = []
  let principalBalance = outstanding[0]?.previousBalance ?? 0

  for (const payment of payments.slice().sort((left, right) => left.paidAt.localeCompare(right.paidAt))) {
    assertMoneyAmount(payment.amount, "payment amount")
    assertMoneyAmount(payment.parkingAmount, "parkingAmount")
    let unapplied = payment.amount
    const paymentAllocations: PaymentAllocation[] = []

    for (const line of outstanding) {
      if (unapplied === 0) break
      const interestAmount = minMoney(line.interestLeft, unapplied)
      line.interestLeft = subtractMoney(line.interestLeft, interestAmount)
      unapplied = subtractMoney(unapplied, interestAmount)

      const principalAmount = minMoney(line.principalLeft, unapplied)
      line.principalLeft = subtractMoney(line.principalLeft, principalAmount)
      unapplied = subtractMoney(unapplied, principalAmount)

      const unclassifiedAmount = minMoney(line.unclassifiedLeft, unapplied)
      line.unclassifiedLeft = subtractMoney(line.unclassifiedLeft, unclassifiedAmount)
      unapplied = subtractMoney(unapplied, unclassifiedAmount)

      if (addMoney(interestAmount, principalAmount, unclassifiedAmount) > 0) {
        paymentAllocations.push({
          installment: line.installment,
          principalAmount,
          interestAmount,
          unclassifiedAmount,
        })
      }
    }

    const principalPaid = addMoney(...paymentAllocations.map((allocation) => allocation.principalAmount))
    principalBalance = Math.max(0, subtractMoney(principalBalance, principalPaid))
    allocations.push(
      ...paymentAllocations.map((allocation) => ({
        ...allocation,
        paymentId: payment.id,
        balanceAfterAmount: principalBalance,
      })),
    )
  }

  return allocations
}

export function calculatePaymentAllocation(schedule: DebtScheduleLine[], payments: DebtPayment[]): PaymentAllocation[] {
  const allocationsByPayment = calculatePaymentAllocationsByPayment(
    schedule,
    payments.map((payment, index) => ({ ...payment, id: String(index) })),
  )
  const totalsByInstallment = new Map<number, PaymentAllocation>()
  for (const allocation of allocationsByPayment) {
    const total = totalsByInstallment.get(allocation.installment) ?? {
      installment: allocation.installment,
      principalAmount: 0,
      interestAmount: 0,
      unclassifiedAmount: 0,
    }
    total.principalAmount = addMoney(total.principalAmount, allocation.principalAmount)
    total.interestAmount = addMoney(total.interestAmount, allocation.interestAmount)
    total.unclassifiedAmount = addMoney(total.unclassifiedAmount, allocation.unclassifiedAmount)
    totalsByInstallment.set(allocation.installment, total)
  }
  return Array.from(totalsByInstallment.values())
}

export function calculateDebtSummary(schedule: DebtScheduleLine[], payments: DebtPayment[], asOf: string): DebtSummary {
  const allocations = calculatePaymentAllocation(schedule, payments)
  const principalPaid = addMoney(...allocations.map((line) => line.principalAmount))
  const interestPaid = addMoney(...allocations.map((line) => line.interestAmount))
  const unclassifiedPaid = addMoney(...allocations.map((line) => line.unclassifiedAmount))
  const scheduledAmount = addMoney(...schedule.map((line) => line.paymentAmount))
  const principalTotal =
    schedule
      .slice()
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.installment - right.installment)[0]
      ?.previousBalance ?? 0
  const scheduleDifference = subtractMoney(
    addMoney(...schedule.map((line) => line.paymentAmount)),
    addMoney(...schedule.map((line) => line.interestAmount)),
    addMoney(...schedule.map((line) => line.principalAmount)),
  )
  const paymentsApplied = addMoney(...payments.map((payment) => payment.amount))
  const fullyPaid = new Set<number>()
  for (const line of schedule) {
    const applied = allocations
      .filter((allocation) => allocation.installment === line.installment)
      .reduce(
        (total, allocation) =>
          addMoney(total, allocation.principalAmount, allocation.interestAmount, allocation.unclassifiedAmount),
        0,
      )
    if (applied === line.paymentAmount) fullyPaid.add(line.installment)
  }

  const pendingLines = schedule
    .filter((line) => !fullyPaid.has(line.installment))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))

  return {
    scheduledAmount,
    balanceAmount: Math.max(0, subtractMoney(scheduledAmount, paymentsApplied)),
    principalTotal,
    principalPaid,
    interestPaid,
    unclassifiedPaid,
    scheduleDifference,
    paymentsApplied,
    parkingPaid: addMoney(...payments.map((payment) => payment.parkingAmount)),
    pendingInstallments: pendingLines.filter((line) => line.dueDate <= asOf).map((line) => line.installment),
    nextInstallment: pendingLines[0]?.installment ?? null,
  }
}
