"use client"

import { Fragment, useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Share2 } from "lucide-react"
import type { CalendarEntry } from "@/lib/calendar/types"
import {
  DEFAULT_COVERED_SHIFT_RATE_THOUSANDS,
  DEFAULT_COVERED_SHIFT_RATE_HISTORY,
  getCoveredShiftDetails,
  getCoveredShiftSummary,
  normalizeCoveredShiftRates,
  type CoveredShiftRate,
} from "@/lib/calendar/coverage-compensation"
import { buildCoveredShiftShareText } from "@/lib/calendar/covered-shift-share"

function formatThousandsCop(amountThousands: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amountThousands)
}

export function CoveredShiftSummary({ entries, month }: { entries: CalendarEntry[]; month: Date }) {
  const [rate, setRate] = useState(DEFAULT_COVERED_SHIFT_RATE_THOUSANDS)
  const [rates, setRates] = useState<CoveredShiftRate[]>(() => [...DEFAULT_COVERED_SHIFT_RATE_HISTORY])
  const [includeDateDetails, setIncludeDateDetails] = useState(false)
  const monthKey = format(month, "yyyy-MM")
  const [selection, setSelection] = useState<{ monthKey: string; ids: Set<string> }>(() => ({
    monthKey,
    ids: new Set(),
  }))
  const selectedShiftIds = selection.monthKey === monthKey ? selection.ids : new Set<string>()
  const shifts = getCoveredShiftDetails(entries, month, rates)
  const summary = getCoveredShiftSummary(entries, month, rates)
  const shiftsByAnesthesiologist = new Map<string, typeof shifts>()
  for (const shift of shifts) {
    const personShifts = shiftsByAnesthesiologist.get(shift.anesthesiologist) ?? []
    personShifts.push(shift)
    shiftsByAnesthesiologist.set(shift.anesthesiologist, personShifts)
  }
  const selectedShiftCount = shifts.filter((shift) => selectedShiftIds.has(shift.id)).length

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

  function toggleAnesthesiologist(anesthesiologist: string) {
    const personShifts = shiftsByAnesthesiologist.get(anesthesiologist) ?? []
    setSelection((current) => {
      const next = new Set(current.monthKey === monthKey ? current.ids : [])
      if (personShifts.some((shift) => next.has(shift.id))) {
        personShifts.forEach((shift) => next.delete(shift.id))
      } else {
        personShifts.forEach((shift) => next.add(shift.id))
      }
      return { monthKey, ids: next }
    })
  }

  function toggleShift(id: string) {
    setSelection((current) => {
      const next = new Set(current.monthKey === monthKey ? current.ids : [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { monthKey, ids: next }
    })
  }

  function shareSelectedShifts() {
    const text = buildCoveredShiftShareText(shifts, selectedShiftIds, month, includeDateDetails)
    if (!text) return

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  }

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
              <th scope="col">Compartir</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => {
              const personShifts = shiftsByAnesthesiologist.get(row.anesthesiologist) ?? []
              const personSelectedCount = personShifts.filter((shift) => selectedShiftIds.has(shift.id)).length
              const personSelectedJornadas = personShifts
                .filter((shift) => selectedShiftIds.has(shift.id))
                .reduce((total, shift) => total + shift.jornadas, 0)

              return (
                <Fragment key={row.anesthesiologist}>
                  <tr key={row.anesthesiologist}>
                    <th scope="row">{row.anesthesiologist}</th>
                    <td>{row.jornadas}</td>
                    <td>{formatThousandsCop(row.totalAmountThousands)}</td>
                    <td>
                      <label className="coverage-share-toggle">
                        <input
                          type="checkbox"
                          checked={personSelectedCount > 0}
                          aria-label={`Incluir turnos de ${row.anesthesiologist} en el reporte`}
                          onChange={() => toggleAnesthesiologist(row.anesthesiologist)}
                        />
                        Incluir
                      </label>
                    </td>
                  </tr>
                  {personSelectedCount > 0 && (
                    <tr key={`${row.anesthesiologist}-shifts`} className="coverage-shift-selection-row">
                      <td colSpan={4}>
                        <fieldset className="coverage-shift-selection">
                          <legend>
                            Selecciona las jornadas de {row.anesthesiologist} ({personSelectedJornadas} de{" "}
                            {row.jornadas})
                          </legend>
                          {personShifts.map((shift) => (
                            <label key={shift.id} className="coverage-shift-option">
                              <input
                                type="checkbox"
                                checked={selectedShiftIds.has(shift.id)}
                                onChange={() => toggleShift(shift.id)}
                              />
                              <span>
                                {format(new Date(`${shift.date}T12:00:00`), "d MMM", { locale: es })} · {shift.period}
                                {shift.jornadas > 1 ? ` (${shift.jornadas} jornadas)` : ""}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{summary.totalJornadas}</td>
              <td>{formatThousandsCop(summary.totalAmountThousands)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="coverage-summary-empty">Sin turnos cubiertos en este mes.</p>
      )}
      <div className="coverage-share-actions">
        <label className="coverage-share-toggle">
          <input
            type="checkbox"
            checked={includeDateDetails}
            onChange={(event) => setIncludeDateDetails(event.target.checked)}
          />
          Incluir desglose por fecha
        </label>
        <button
          type="button"
          className="submit-button coverage-share-button"
          disabled={selectedShiftCount === 0}
          onClick={shareSelectedShifts}
        >
          <Share2 size={14} aria-hidden="true" />
          Compartir seleccionados por WhatsApp
        </button>
      </div>
    </section>
  )
}
