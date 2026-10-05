import { ArrowUpRight, CreditCard } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { getDebtPlanSnapshot } from "@/lib/debt/plan-snapshot"

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount)
}

export function DebtSummaryCard() {
  const plan = getDebtPlanSnapshot(format(new Date(), "yyyy-MM"))

  return (
    <section className="debt-card" id="debt">
      <div className="debt-card-head">
        <span className="debt-icon">
          <CreditCard size={16} />
        </span>
        <span>Plan de acciones</span>
        <span className="debt-rate">8% EA</span>
      </div>
      <p className="debt-card-title">Saldo según plan · inicio de mes</p>
      <p className="debt-card-value">
        {formatAmount(plan.balanceAtMonthStart)}
        <small>miles COP</small>
      </p>
      <div className="debt-card-divider" />
      <div className="last-payment">
        <span>
          {plan.nextInstallment
            ? `Cuota programada · ${format(new Date(`${plan.nextInstallment.month}-01T12:00:00`), "MMMM yyyy", { locale: es })}`
            : "Plan completado"}
        </span>
        <strong>{plan.nextInstallment ? `${formatAmount(plan.nextInstallment.amount)} mil` : "0 mil"}</strong>
      </div>
      {plan.nextInstallment && (
        <div className="payment-split">
          <span>
            Capital <b>{formatAmount(plan.nextInstallment.principalAmount)}</b>
          </span>
          <span>
            Interés <b>{formatAmount(plan.nextInstallment.interestAmount)}</b>
          </span>
        </div>
      )}
      <div className="debt-card-divider" />
      <div className="last-payment">
        <span>Última transferencia real · 11 jul 2026</span>
        <strong>{formatAmount(11_797)} mil</strong>
      </div>
      <div className="payment-split">
        <span>
          Deuda <b>11.647</b>
        </span>
        <span>
          Parqueadero <b>150</b>
        </span>
      </div>
      <p className="debt-no-late-interest">Sin interés de mora · parqueadero fuera del saldo</p>
      <a href="#debt" className="debt-link">
        Ver detalle del plan <ArrowUpRight size={14} />
      </a>
    </section>
  )
}
