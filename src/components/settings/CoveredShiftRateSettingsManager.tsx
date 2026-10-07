"use client"

import { useEffect, useState, type FormEvent } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CircleDollarSign, Pencil, Save, Trash2, X } from "lucide-react"
import { MoneyInput } from "@/components/forms/MoneyInput"
import {
  DEFAULT_COVERED_SHIFT_RATE_THOUSANDS,
  DEFAULT_COVERED_SHIFT_RATE_HISTORY,
  type CoveredShiftRate,
} from "@/lib/calendar/coverage-compensation"

type CoverageRateResponse = {
  amountThousands: number
  configuredAmountThousands: number
  effectiveFrom: string
  minimumEffectiveFrom: string
  rates: CoveredShiftRate[]
}

function formatThousandsCop(amountThousands: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amountThousands)
}

function formatEffectiveDate(date: string) {
  return date === "1900-01-01" ? "Base histórica" : format(new Date(`${date}T12:00:00`), "d MMM yyyy", { locale: es })
}

export function CoveredShiftRateSettingsManager() {
  const [rates, setRates] = useState<CoveredShiftRate[]>(() => [...DEFAULT_COVERED_SHIFT_RATE_HISTORY])
  const [minimumEffectiveFrom, setMinimumEffectiveFrom] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState("")
  const [amount, setAmount] = useState(String(DEFAULT_COVERED_SHIFT_RATE_THOUSANDS))
  const [editingEffectiveFrom, setEditingEffectiveFrom] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/calendar/coverage-rate", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as CoverageRateResponse
        if (!response.ok) throw new Error((result as { error?: string }).error ?? "No se pudo consultar la tarifa.")
        if (controller.signal.aborted) return
        setRates(result.rates)
        setMinimumEffectiveFrom(result.minimumEffectiveFrom)
        setEffectiveFrom(result.minimumEffectiveFrom)
        setAmount(String(result.configuredAmountThousands))
        setReady(true)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo consultar la tarifa.")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  function editRate(rate: CoveredShiftRate) {
    setEditingEffectiveFrom(rate.effectiveFrom)
    setEffectiveFrom(rate.effectiveFrom)
    setAmount(String(rate.amountThousands))
    setError("")
    setMessage("")
  }

  function cancelEdit() {
    setEditingEffectiveFrom(null)
    setEffectiveFrom(minimumEffectiveFrom)
    setAmount(String(rates.at(-1)?.amountThousands ?? DEFAULT_COVERED_SHIFT_RATE_THOUSANDS))
    setError("")
    setMessage("")
  }

  async function deleteRate(effectiveFromToDelete: string) {
    const rate = rates.find((item) => item.effectiveFrom === effectiveFromToDelete)
    if (!rate) return
    const isPast = effectiveFromToDelete < minimumEffectiveFrom
    const nextRate = rates.find((item) => item.effectiveFrom > effectiveFromToDelete)
    const periodEnd = nextRate ? `hasta ${formatEffectiveDate(nextRate.effectiveFrom)}` : "hasta el siguiente cambio"
    const confirmation = isPast
      ? `Las jornadas pasadas ${periodEnd} se recalcularán con la tarifa anterior. ¿Borrar este valor?`
      : `Las jornadas desde ${formatEffectiveDate(effectiveFromToDelete)} ${periodEnd} usarán la tarifa anterior. ¿Continuar?`
    if (!window.confirm(confirmation)) return

    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/calendar/coverage-rate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveFrom: effectiveFromToDelete }),
      })
      const result = (await response.json()) as CoverageRateResponse & { error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar la tarifa.")
      setRates(result.rates)
      setMinimumEffectiveFrom(result.minimumEffectiveFrom)
      setEditingEffectiveFrom(null)
      setEffectiveFrom(result.minimumEffectiveFrom)
      setAmount(String(result.configuredAmountThousands))
      setMessage("Tarifa eliminada; las jornadas de ese período usan la tarifa anterior.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo borrar la tarifa.")
    } finally {
      setSaving(false)
    }
  }

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const previousRate = editingEffectiveFrom ? rates.find((rate) => rate.effectiveFrom === editingEffectiveFrom) : null
    const changed =
      !previousRate || previousRate.amountThousands !== Number(amount) || previousRate.effectiveFrom !== effectiveFrom
    const changesPastPeriod =
      (editingEffectiveFrom !== null && editingEffectiveFrom < minimumEffectiveFrom) ||
      effectiveFrom < minimumEffectiveFrom
    if (changed && changesPastPeriod) {
      const nextRate = rates.find((rate) => rate.effectiveFrom > (editingEffectiveFrom ?? effectiveFrom))
      const periodEnd = nextRate ? `hasta ${formatEffectiveDate(nextRate.effectiveFrom)}` : "hasta el siguiente cambio"
      if (
        !window.confirm(
          `Esta edición recalculará las jornadas del período ${formatEffectiveDate(editingEffectiveFrom ?? effectiveFrom)} ${periodEnd}. ¿Continuar?`,
        )
      ) {
        return
      }
    }

    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/calendar/coverage-rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountThousands: Number(amount),
          effectiveFrom,
          ...(editingEffectiveFrom ? { previousEffectiveFrom: editingEffectiveFrom } : {}),
        }),
      })
      const result = (await response.json()) as CoverageRateResponse & { error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la tarifa.")
      setRates(result.rates)
      setMinimumEffectiveFrom(result.minimumEffectiveFrom)
      setEffectiveFrom(result.minimumEffectiveFrom)
      setAmount(String(result.configuredAmountThousands))
      setEditingEffectiveFrom(null)
      setMessage("Historial actualizado; cada jornada conserva la tarifa vigente en su fecha.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la tarifa.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="annual-plan-panel" aria-labelledby="covered-shift-rate-title">
      <div className="annual-plan-heading">
        <span className="annual-plan-icon">
          <CircleDollarSign size={18} />
        </span>
        <div>
          <p className="eyebrow">Tarifas por vigencia</p>
          <h2 id="covered-shift-rate-title">Jornada cubierta</h2>
        </div>
      </div>
      <p className="annual-plan-help">
        Cada jornada dura 6 h; NOCHE y AM + PM valen 2. Editar o borrar una tarifa recalcula las jornadas de ese período
        con el valor vigente correspondiente.
      </p>
      {loading ? (
        <p className="invoice-empty">Consultando historial de tarifas…</p>
      ) : (
        <>
          <form className="coverage-rate-form" onSubmit={saveRate}>
            <label className="form-field">
              <span>Valor por jornada · miles COP</span>
              <MoneyInput value={amount} onValueChange={setAmount} required disabled={!ready} />
            </label>
            <label className="form-field">
              <span>Entrada en vigor</span>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                disabled={!ready || editingEffectiveFrom === rates[0]?.effectiveFrom}
              />
            </label>
            {editingEffectiveFrom === rates[0]?.effectiveFrom && (
              <p className="annual-plan-help">
                La tarifa base se puede cambiar de valor, pero su fecha permanece fija.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="annual-plan-message" role="status">
                {message}
              </p>
            )}
            <div className="annual-plan-actions">
              <button type="submit" className="submit-button" disabled={saving || !ready}>
                <Save size={15} />{" "}
                {saving ? "Guardando…" : editingEffectiveFrom ? "Guardar cambio" : "Programar tarifa"}
              </button>
              {editingEffectiveFrom && (
                <button type="button" className="coverage-rate-cancel" onClick={cancelEdit} disabled={saving}>
                  <X size={15} /> Cancelar
                </button>
              )}
            </div>
          </form>
          <div className="coverage-rate-history-wrap">
            <table className="coverage-rate-history">
              <thead>
                <tr>
                  <th scope="col">Entrada en vigor</th>
                  <th scope="col">Tarifa · miles COP</th>
                  <th scope="col">Edición</th>
                </tr>
              </thead>
              <tbody>
                {[...rates].reverse().map((rate) => {
                  const isBaseRate = rate.effectiveFrom === rates[0]?.effectiveFrom
                  return (
                    <tr key={rate.effectiveFrom}>
                      <th scope="row">{formatEffectiveDate(rate.effectiveFrom)}</th>
                      <td>{formatThousandsCop(rate.amountThousands)}</td>
                      <td>
                        <div className="coverage-rate-row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Editar tarifa desde ${formatEffectiveDate(rate.effectiveFrom)}`}
                            title="Editar tarifa y período"
                            onClick={() => editRate(rate)}
                            disabled={saving}
                          >
                            <Pencil size={14} />
                          </button>
                          {!isBaseRate && (
                            <button
                              type="button"
                              className="icon-button danger"
                              aria-label={`Borrar tarifa desde ${formatEffectiveDate(rate.effectiveFrom)}`}
                              title="Borrar tarifa"
                              onClick={() => void deleteRate(rate.effectiveFrom)}
                              disabled={saving}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
