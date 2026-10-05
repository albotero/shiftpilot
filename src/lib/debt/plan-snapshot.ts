import { initialDebtSchedule } from "../../../prisma/debt-schedule"

export type DebtPlanSnapshot = {
  balanceAtMonthStart: number
  nextInstallment: {
    month: string
    amount: number
    principalAmount: number
    interestAmount: number
  } | null
}

export function getDebtPlanSnapshot(month: string): DebtPlanSnapshot {
  const nextRow = initialDebtSchedule.find(([scheduledMonth]) => scheduledMonth >= month)
  const lastRow = initialDebtSchedule[initialDebtSchedule.length - 1]

  return {
    balanceAtMonthStart: nextRow?.[1] ?? lastRow[6],
    nextInstallment: nextRow
      ? {
          month: nextRow[0],
          amount: nextRow[3],
          principalAmount: nextRow[5],
          interestAmount: nextRow[4],
        }
      : null,
  }
}
