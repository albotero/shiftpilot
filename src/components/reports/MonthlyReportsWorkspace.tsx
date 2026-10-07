"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { PageHeading } from "@/components/dashboard/PageHeading"

type MonthlyReport = {
  month: string
  work: {
    shiftCount: number
    hours: number
    coveredShiftCount: number
    coveredHours: number
    coverageAssignments: number
  }
  billing: { invoiceCount: number; registeredNetAmount: number }
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
  debt: {
    scheduledInstallments: number
    scheduledAmount: number
    paymentCount: number
    paidAmount: number
    parkingAmount: number
  } | null
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

function ReportMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function MonthlyReportsWorkspace() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [loadedMonth, setLoadedMonth] = useState("")
  const [error, setError] = useState("")
  const loading = loadedMonth !== month

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/reports/monthly?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as MonthlyReport & { error?: string }
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el reporte mensual.")
        if (controller.signal.aborted) return
        setReport(result)
        setError("")
        setLoadedMonth(month)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el reporte mensual.")
          setLoadedMonth(month)
        }
      })
    return () => controller.abort()
  }, [month])

  return (
    <div className="monthly-reports-page">
      <PageHeading
        eyebrow="Actividad y finanzas"
        title="Reportes"
        description="Resumen mensual de trabajo, facturación registrada, aportes y deuda."
        action={
          <label className="finance-month-picker">
            <span>Mes</span>
            <input
              type="month"
              aria-label="Mes del reporte"
              value={month}
              required
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value)
              }}
            />
          </label>
        }
      />

      <div className="monthly-report-content" aria-busy={loading}>
        <p className="eyebrow monthly-report-period">
          {format(new Date(`${month}-01T12:00:00`), "MMMM yyyy", { locale: es })}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="replacement-people-empty">Generando reporte…</p>
        ) : report ? (
          <div className="monthly-report-grid">
            <section className="monthly-report-section" aria-labelledby="monthly-work-title">
              <p className="eyebrow">Calendario</p>
              <h2 id="monthly-work-title">Trabajo y coberturas</h2>
              <dl className="monthly-report-metrics">
                <ReportMetric label="Jornadas" value={report.work.shiftCount} />
                <ReportMetric label="Horas trabajadas" value={`${formatAmount(report.work.hours)} h`} />
                <ReportMetric label="Jornadas cubiertas" value={report.work.coveredShiftCount} />
                <ReportMetric label="Horas cubiertas" value={`${formatAmount(report.work.coveredHours)} h`} />
                <ReportMetric label="Asignaciones de cobertura" value={report.work.coverageAssignments} />
              </dl>
            </section>

            <section className="monthly-report-section" aria-labelledby="monthly-billing-title">
              <p className="eyebrow">Facturación</p>
              <h2 id="monthly-billing-title">Facturas registradas</h2>
              <dl className="monthly-report-metrics">
                <ReportMetric label="Facturas" value={report.billing.invoiceCount} />
                <ReportMetric
                  label="Neto facturado"
                  value={`${formatAmount(report.billing.registeredNetAmount)} mil COP`}
                />
              </dl>
            </section>

            <section className="monthly-report-section" aria-labelledby="monthly-social-title">
              <p className="eyebrow">Seguridad social</p>
              <h2 id="monthly-social-title">IBC y aportes</h2>
              {report.socialSecurity ? (
                <dl className="monthly-report-metrics">
                  <ReportMetric
                    label="Bruto facturado"
                    value={`${formatAmount(report.socialSecurity.grossAmount)} mil`}
                  />
                  <ReportMetric label="Descuentos" value={`${formatAmount(report.socialSecurity.discounts)} mil`} />
                  <ReportMetric label="Neto facturado" value={`${formatAmount(report.socialSecurity.netAmount)} mil`} />
                  <ReportMetric label="IBC" value={`${formatAmount(report.socialSecurity.ibcAmount)} mil`} />
                  <ReportMetric label="Salud" value={`${formatAmount(report.socialSecurity.healthAmount)} mil`} />
                  <ReportMetric label="Pensión" value={`${formatAmount(report.socialSecurity.pensionAmount)} mil`} />
                  <ReportMetric label="ARL" value={`${formatAmount(report.socialSecurity.arlAmount)} mil`} />
                  <ReportMetric label="Caja" value={`${formatAmount(report.socialSecurity.fundAmount)} mil`} />
                  <ReportMetric
                    label="Fondo de solidaridad"
                    value={`${formatAmount(report.socialSecurity.solidarityAmount)} mil`}
                  />
                  <ReportMetric
                    label="Total de aportes"
                    value={`${formatAmount(report.socialSecurity.totalAmount)} mil COP`}
                  />
                </dl>
              ) : (
                <p className="monthly-report-empty">No hay un cálculo guardado para este mes.</p>
              )}
            </section>

            <section className="monthly-report-section" aria-labelledby="monthly-debt-title">
              <p className="eyebrow">Deuda</p>
              <h2 id="monthly-debt-title">Plan y pagos reales</h2>
              {report.debt ? (
                <dl className="monthly-report-metrics">
                  <ReportMetric label="Cuotas del plan" value={report.debt.scheduledInstallments} />
                  <ReportMetric
                    label="Valor según plan fijo"
                    value={`${formatAmount(report.debt.scheduledAmount)} mil`}
                  />
                  <ReportMetric label="Pagos registrados" value={report.debt.paymentCount} />
                  <ReportMetric label="Abonos registrados" value={`${formatAmount(report.debt.paidAmount)} mil`} />
                  <ReportMetric
                    label="Parqueadero registrado"
                    value={`${formatAmount(report.debt.parkingAmount)} mil`}
                  />
                </dl>
              ) : (
                <p className="monthly-report-empty">No hay plan de deuda configurado.</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
