"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { CalendarEntry } from "@/lib/calendar/types"
import {
  DEFAULT_COVERED_SHIFT_RATE_THOUSANDS,
  DEFAULT_COVERED_SHIFT_RATE_HISTORY,
  getCoveredShiftSummary,
  normalizeCoveredShiftRates,
  type CoveredShiftRate,
} from "@/lib/calendar/coverage-compensation"

function formatThousandsCop(amountThousands: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amountThousands)
}

export function CoveredShiftSummary({ entries, month }: { entries: CalendarEntry[]; month: Date }) {
  const [rate, setRate] = useState(DEFAULT_COVERED_SHIFT_RATE_THOUSANDS)
  const [rates, setRates] = useState<CoveredShiftRate[]>(() => [...DEFAULT_COVERED_SHIFT_RATE_HISTORY])
  const summary = getCoveredShiftSummary(entries, month, rates)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/calendar/coverage-rate", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la tarifa por jornada.")
        if (!controller.signal.aborted && Number.isFinite(result.amountThousands) && result.amountThousands >= 0) {
          setRate(result.amountThousands)
          setRates(normalizeCoveredShiftRates(result.rates))
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <section className="coverage-summary-panel" aria-labelledby="coverage-summary-title">
      <div className="coverage-summary-heading">
        <div>
          <p className="eyebrow">Turnos cubiertos</p>
          <h2 id="coverage-summary-title">Anestesiólogos · {format(month, "MMMM yyyy", { locale: es })}</h2>
        </div>
        <span className="coverage-summary-rate">{formatThousandsCop(rate)} mil COP por jornada</span>
      </div>
      <p className="coverage-summary-note">Cada jornada equivale a 6 h; NOCHE y AM + PM cuentan como 2.</p>
      {summary.rows.length > 0 ? (
        <table className="coverage-summary-table">
          <thead>
            <tr>
              <th scope="col">Anestesiólogo</th>
              <th scope="col">Jornadas</th>
              <th scope="col">Valor total · miles COP</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.anesthesiologist}>
                <th scope="row">{row.anesthesiologist}</th>
                <td>{row.jornadas}</td>
                <td>{formatThousandsCop(row.totalAmountThousands)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{summary.totalJornadas}</td>
              <td>{formatThousandsCop(summary.totalAmountThousands)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="coverage-summary-empty">Sin turnos cubiertos en este mes.</p>
      )}
    </section>
  )
}
