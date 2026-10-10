import { format } from "date-fns"
import { es } from "date-fns/locale"

export type SharedDebtPaymentAllocation = {
  installment: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  unclassifiedAmount: number
  balanceAfterAmount: number
  totalBalanceAfterAmount: number
}

export type SharedDebtPayment = {
  amount: number
  parkingAmount: number
  notes: string | null
  allocations: SharedDebtPaymentAllocation[]
}

// Ledger amounts are stored in thousands of COP; recipients read full pesos.
export function formatPesos(thousands: number) {
  const pesos = Math.round(thousands * 1000)
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(pesos)}`
}

function formatDate(date: string, pattern: string) {
  return format(new Date(`${date}T12:00:00`), pattern, { locale: es })
}

export function buildDebtPaymentShareText(payment: SharedDebtPayment) {
  const total = Math.round((payment.amount + payment.parkingAmount) * 1000) / 1000
  const lines = [
    `Total transferido: *${formatPesos(total)}*`,
    `• Abono a deuda: ${formatPesos(payment.amount)}`,
    `• Parqueadero: ${formatPesos(payment.parkingAmount)}`,
  ]
  if (payment.notes?.trim()) lines.push(`Notas: ${payment.notes.trim()}`)

  for (const allocation of payment.allocations) {
    lines.push("", `*Cuota ${allocation.installment}* · ${formatDate(allocation.dueDate, "MMMM yyyy")}`)
    lines.push(`• Interés: ${formatPesos(allocation.interestAmount)}`)
    lines.push(`• Capital: ${formatPesos(allocation.principalAmount)}`)
    if (Number.isFinite(allocation.unclassifiedAmount) && allocation.unclassifiedAmount > 0) {
      lines.push(`• Sin clasificar: ${formatPesos(allocation.unclassifiedAmount)}`)
    }
    lines.push(`• Saldo a capital: ${formatPesos(allocation.balanceAfterAmount)}`)
    lines.push(`• Saldo total: ${formatPesos(allocation.totalBalanceAfterAmount)}`)
  }

  return lines.join("\n")
}

export function getWhatsAppShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
