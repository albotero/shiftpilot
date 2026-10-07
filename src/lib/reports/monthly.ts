import { addMoney } from "@/lib/money/integer"

const personallyWorkedStatuses = new Set([
  "TURNO",
  "NOCHE",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "TURNO_DE_OTRA_PERSONA",
  "EXTERNO",
  "EXTERNO_NOCHE",
])

export type MonthlyReportInput = {
  month: string
  shifts: { status: string; period: string; durationHours: number; coverageCount: number }[]
  invoices: { netAmount: number }[]
  socialSecurity: {
    grossAmount: number
    discounts: number
    netAmount: number
    ibcAmount: number
    healthAmount: number
    pensionAmount: number
    arlAmount: number
    fundAmount: number
    solidarityAmount: number
    totalAmount: number
  } | null
  debtSchedule: { paymentAmount: number }[]
  debtPayments: { amount: number; parkingAmount: number }[]
}

export function buildMonthlyReport(input: MonthlyReportInput) {
  const workedShifts = input.shifts.filter((shift) => personallyWorkedStatuses.has(shift.status))
  const coveredShifts = input.shifts.filter(
    (shift) =>
      shift.coverageCount > 0 || shift.status === "TURNO_OTRA_PERSONA" || shift.status === "TURNO_DE_OTRA_PERSONA",
  )

  return {
    month: input.month,
    work: {
      shiftCount: workedShifts.reduce((count, shift) => count + (shift.period === "NOCHE" ? 2 : 1), 0),
      hours: workedShifts.reduce((total, shift) => total + shift.durationHours, 0),
      coveredShiftCount: coveredShifts.length,
      coveredHours: coveredShifts.reduce((total, shift) => total + shift.durationHours, 0),
      coverageAssignments: coveredShifts.reduce((total, shift) => total + Math.max(shift.coverageCount, 1), 0),
    },
    billing: {
      invoiceCount: input.invoices.length,
      registeredNetAmount: addMoney(...input.invoices.map((invoice) => invoice.netAmount)),
    },
    socialSecurity: input.socialSecurity,
    debt:
      input.debtSchedule.length > 0 || input.debtPayments.length > 0
        ? {
            scheduledInstallments: input.debtSchedule.length,
            scheduledAmount: addMoney(...input.debtSchedule.map((line) => line.paymentAmount)),
            paymentCount: input.debtPayments.length,
            paidAmount: addMoney(...input.debtPayments.map((payment) => payment.amount)),
            parkingAmount: addMoney(...input.debtPayments.map((payment) => payment.parkingAmount)),
          }
        : null,
  }
}
