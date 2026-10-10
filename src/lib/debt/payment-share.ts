import { format } from "date-fns"
import { es } from "date-fns/locale"
import { addMoney } from "@/lib/money/integer"

export type SharedDebtPaymentAllocation = {
  installment: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  unclassifiedAmount: number
  balanceAfterAmount: number
  totalBalanceAfterAmount: number
  installmentAmount: number
  installmentBalanceAfterAmount: number
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
  const total = addMoney(payment.amount, payment.parkingAmount)
  const lines = [
    `Total transferido: *${formatPesos(total)}*`,
    `• Abono a deuda: ${formatPesos(payment.amount)}`,
    `• Parqueadero: ${formatPesos(payment.parkingAmount)}`,
  ]
  if (payment.notes?.trim()) lines.push(`Notas: ${payment.notes.trim()}`)

  const balance = payment.allocations[0]
  if (balance) {
    lines.push(
      "",
      "Saldos después del pago:",
      `• Saldo a capital: ${formatPesos(balance.balanceAfterAmount)}`,
      `• Saldo total (capital + intereses): ${formatPesos(balance.totalBalanceAfterAmount)}`,
      "",
      "────────────────────",
    )
  }

  for (const allocation of payment.allocations) {
    const applied = addMoney(allocation.principalAmount, allocation.interestAmount, allocation.unclassifiedAmount)
    const partial = applied < allocation.installmentAmount
    lines.push("", `*Cuota ${allocation.installment}* · ${formatDate(allocation.dueDate, "MMMM yyyy")}`)
    lines.push(`• Capital${partial ? " abonado" : ""}: ${formatPesos(allocation.principalAmount)}`)
    lines.push(`• Intereses${partial ? " abonados" : ""}: ${formatPesos(allocation.interestAmount)}`)
    if (Number.isFinite(allocation.unclassifiedAmount) && allocation.unclassifiedAmount > 0) {
      lines.push(`• Sin clasificar: ${formatPesos(allocation.unclassifiedAmount)}`)
    }
    lines.push(`• Total de la cuota: *${formatPesos(allocation.installmentAmount)}*`)
    if (partial) lines.push(`• Abono en este pago: ${formatPesos(applied)}`)
    lines.push(
      `• Estado después del pago: ${
        allocation.installmentBalanceAfterAmount === 0
          ? "Cancelada"
          : `Pendiente *${formatPesos(allocation.installmentBalanceAfterAmount)}*`
      }`,
    )
  }

  return lines.join("\n")
}

export function getWhatsAppShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
