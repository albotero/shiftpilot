"use client"

import { useState } from "react"
import { format } from "date-fns"
import { InvoiceManager } from "@/components/billing/InvoiceManager"
import { PageHeading } from "@/components/dashboard/PageHeading"

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

export function FinanceWorkspace() {
  const [summary, setSummary] = useState({ count: 0, netAmount: 0 })
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))

  return (
    <>
      <PageHeading
        eyebrow="Gestión financiera"
        title="Finanzas"
        description="Facturas, partidas, vencimientos y estado de cobro."
        action={
          <div className="finance-page-actions">
            <label className="finance-month-picker">
              <span>Mes</span>
              <input
                type="month"
                aria-label="Mes de facturación"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
            <span className="stat-trend green-text">
              {formatAmount(summary.netAmount)} mil · {summary.count} factura{summary.count === 1 ? "" : "s"}
            </span>
          </div>
        }
      />
      <InvoiceManager month={month} onSummaryChange={setSummary} onMonthChange={setMonth} />
    </>
  )
}
