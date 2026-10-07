"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight, CreditCard } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { getDebtPlanSnapshot } from "@/lib/debt/plan-snapshot"
import { addMoney } from "@/lib/money/integer"

type DebtLedger = {
  summary: { balanceAmount: number }
  nextInstallment: {
    dueDate: string
    amount: number
    parkingAmount: number
    totalTransferAmount: number
    principalAmount: number
    interestAmount: number
  } | null
  payments: { paidAt: string; amount: number; parkingAmount: number }[]
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

export function DebtSummaryCard({ showDetailsLink = false }: { showDetailsLink?: boolean }) {
  const plan = getDebtPlanSnapshot(format(new Date(), "yyyy-MM"))
  const [ledger, setLedger] = useState<DebtLedger | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/debt/payments", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el registro de pagos.")
        setLedger((await response.json()) as DebtLedger)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const nextInstallment = ledger
    ? ledger.nextInstallment
      ? {
          ...ledger.nextInstallment,
          month: ledger.nextInstallment.dueDate.slice(0, 7),
        }
      : null
    : plan.nextInstallment
      ? { ...plan.nextInstallment, parkingAmount: 0, totalTransferAmount: plan.nextInstallment.amount }
      : null
  const lastPayment = ledger?.payments.at(-1) ?? null
  const balance = ledger?.summary.balanceAmount ?? plan.balanceAtMonthStart

  return (
    <section className="debt-card" id="debt">
      <div className="debt-card-hero">
        <div className="debt-card-head">
          <div className="debt-card-identity">
            <span className="debt-icon">
              <CreditCard size={17} />
            </span>
            <span>Plan de acciones</span>
          </div>
          <span className="debt-rate">8% EA</span>
        </div>
        <div className="debt-card-balance">
          <p className="debt-card-title">
            {ledger ? "Saldo pendiente · capital + intereses" : "Saldo según plan · capital + intereses"}
          </p>
          <p className="debt-card-value">
            <span>{formatAmount(balance)}</span>
            <small>miles COP</small>
          </p>
          {!ledger && <span className="debt-card-as-of">Saldo al inicio del mes</span>}
        </div>
      </div>
      <div className="debt-card-body">
        <div className="debt-card-detail">
          <div className="debt-card-row">
            <div className="debt-card-row-label">
              <span>Próxima transferencia</span>
              <strong className="debt-card-date">
                {nextInstallment
                  ? format(new Date(`${nextInstallment.month}-01T12:00:00`), "MMMM yyyy", { locale: es })
                  : "Plan completado"}
              </strong>
            </div>
            <strong className="debt-card-row-value">
              {nextInstallment ? `${formatAmount(nextInstallment.totalTransferAmount)} mil` : "0 mil"}
            </strong>
          </div>
          {nextInstallment && (
            <div className="payment-split">
              <span>
                <span>Capital</span>
                <b>{formatAmount(nextInstallment.principalAmount)}</b>
              </span>
              <span>
                <span>Interés</span>
                <b>{formatAmount(nextInstallment.interestAmount)}</b>
              </span>
              <span>
                <span>Parqueadero</span>
                <b>{formatAmount(nextInstallment.parkingAmount)}</b>
              </span>
            </div>
          )}
        </div>
        <div className="debt-card-detail">
          <div className="debt-card-row">
            <div className="debt-card-row-label">
              <span>Última transferencia</span>
              <strong className="debt-card-date">
                {lastPayment
                  ? format(new Date(`${lastPayment.paidAt}T12:00:00`), "dd MMM yyyy", { locale: es })
                  : "Sin registros"}
              </strong>
            </div>
            <strong className="debt-card-row-value">
              {lastPayment ? `${formatAmount(addMoney(lastPayment.amount, lastPayment.parkingAmount))} mil` : "—"}
            </strong>
          </div>
          {lastPayment ? (
            <div className="payment-split debt-card-last-split">
              <span>
                <span>Deuda</span>
                <b>{formatAmount(lastPayment.amount)}</b>
              </span>
              <span>
                <span>Parqueadero</span>
                <b>{formatAmount(lastPayment.parkingAmount)}</b>
              </span>
            </div>
          ) : (
            <p className="debt-no-late-interest">Sin interés de mora · parqueadero fuera del saldo</p>
          )}
        </div>
        {showDetailsLink && (
          <Link href="/debt" className="debt-link">
            Ver detalle del plan <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </section>
  )
}
