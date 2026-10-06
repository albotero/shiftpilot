"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Save } from "lucide-react"
import type { ArlRiskClass, SocialSecurityConfiguration, SocialSecurityRates } from "@/lib/social-security/calculations"

type Period = {
  grossAmount: number
  discounts: number
  netAmount: number
  ibcAmount: number
  healthAmountTenths: number
  pensionAmountTenths: number
  arlAmountTenths: number
  fundAmountTenths: number
  solidarityAmountTenths: number
  totalAmountTenths: number
}

type SocialSecurityResponse = {
  month: string
  configuration: SocialSecurityConfiguration
  rates: SocialSecurityRates
  minimumWage: { year: number; sourceYear: number; amountCop: number; sourceUrl: string; stale: boolean }
  period: Period
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

export function SocialSecurityManager({ month, refreshToken }: { month: string; refreshToken: number }) {
  const [result, setResult] = useState<SocialSecurityResponse | null>(null)
  const [configuration, setConfiguration] = useState<SocialSecurityConfiguration | null>(null)
  const [loadedMonth, setLoadedMonth] = useState("")
  const [loadError, setLoadError] = useState<{ month: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const loading = loadedMonth !== month
  const visibleError = error || (loadError?.month === month ? loadError.message : "")

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/social-security?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "No se pudo consultar seguridad social.")
        const parsed = data as SocialSecurityResponse
        setResult(parsed)
        setConfiguration(parsed.configuration)
        setLoadError(null)
        setLoadedMonth(month)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setLoadError({
            month,
            message: loadError instanceof Error ? loadError.message : "No se pudo consultar seguridad social.",
          })
          setLoadedMonth(month)
        }
      })
    return () => controller.abort()
  }, [month, refreshToken])

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configuration) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/social-security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, configuration }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la configuración.")
      const saved = data as SocialSecurityResponse
      setResult(saved)
      setConfiguration(saved.configuration)
      setMessage("Configuración guardada y período recalculado.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  const contributions = result
    ? [
        { label: "Salud", rate: result.rates.healthRatePpm, amount: result.period.healthAmountTenths },
        { label: "Pensión", rate: result.rates.pensionRatePpm, amount: result.period.pensionAmountTenths },
        {
          label: `ARL · clase ${result.configuration.arlRiskClass}`,
          rate: result.rates.arlRatePpm,
          amount: result.period.arlAmountTenths,
        },
        { label: "Caja", rate: result.rates.fundRatePpm, amount: result.period.fundAmountTenths },
        {
          label: "Fondo de solidaridad",
          rate: result.rates.solidarityRatePpm,
          amount: result.period.solidarityAmountTenths,
        },
      ]
    : []

  return (
    <section className="social-security-panel" aria-labelledby="social-security-title">
      <div className="social-security-heading">
        <div>
          <p className="eyebrow">Aportes del período</p>
          <h2 id="social-security-title">Seguridad social · {month}</h2>
        </div>
        <strong className="social-security-total">
          {result ? formatAmount(result.period.totalAmountTenths / 10) : "—"} mil COP
        </strong>
      </div>

      {loading ? (
        <p className="invoice-empty">Calculando período…</p>
      ) : result ? (
        <>
          <dl className="social-security-summary">
            <div>
              <dt>Bruto</dt>
              <dd>{formatAmount(result.period.grossAmount)}</dd>
            </div>
            <div>
              <dt>Descuentos</dt>
              <dd>{formatAmount(result.period.discounts)}</dd>
            </div>
            <div>
              <dt>Neto facturado</dt>
              <dd>{formatAmount(result.period.netAmount)}</dd>
            </div>
            <div>
              <dt>IBC</dt>
              <dd>{formatAmount(result.period.ibcAmount)}</dd>
            </div>
          </dl>

          <p className="social-security-minimum-wage">
            <span>
              {result.minimumWage.stale
                ? `Último SMMLV oficial verificado (${result.minimumWage.sourceYear})`
                : `SMMLV ${result.minimumWage.year}`}
              :
            </span>
            <strong>{formatAmount(result.minimumWage.amountCop / 1000)} mil COP</strong>
            {result.minimumWage.stale && <span> · valor pendiente de actualizar con MinTrabajo</span>}
            <span aria-hidden="true"> · </span>
            <a href={result.minimumWage.sourceUrl} target="_blank" rel="noreferrer">
              Fuente oficial
            </a>
          </p>

          <div className="social-security-contributions" aria-label="Aportes calculados">
            {contributions.map(({ label, rate, amount }) => (
              <div className="social-security-contribution" key={label}>
                <span>
                  {label} {(Number(rate) / 10_000).toLocaleString("es-CO", { maximumFractionDigits: 3 })}%
                </span>
                <strong>{formatAmount(Number(amount) / 10)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <form className="social-security-rates" onSubmit={saveConfiguration}>
        <h3>Configuración de aportes</h3>
        <div className="social-security-rate-grid">
          <label className="time-toggle social-security-option">
            <input
              type="checkbox"
              checked={configuration?.pensionEnabled ?? false}
              onChange={(event) =>
                setConfiguration((current) =>
                  current ? { ...current, pensionEnabled: event.target.checked } : current,
                )
              }
            />
            <span>Pago pensión · 16%</span>
          </label>
          <label className="time-toggle social-security-option">
            <input
              type="checkbox"
              checked={configuration?.arlEnabled ?? false}
              onChange={(event) =>
                setConfiguration((current) => (current ? { ...current, arlEnabled: event.target.checked } : current))
              }
            />
            <span>Pago ARL</span>
          </label>
          {configuration?.arlEnabled && (
            <label className="form-field">
              <span>Clase de riesgo ARL</span>
              <select
                value={configuration.arlRiskClass}
                onChange={(event) =>
                  setConfiguration((current) =>
                    current ? { ...current, arlRiskClass: event.target.value as ArlRiskClass } : current,
                  )
                }
              >
                <option value="I">I · 0,522%</option>
                <option value="II">II · 1,044%</option>
                <option value="III">III · 2,436%</option>
                <option value="IV">IV · 4,350%</option>
                <option value="V">V · 6,960%</option>
              </select>
            </label>
          )}
          <label className="time-toggle social-security-option">
            <input
              type="checkbox"
              checked={configuration?.compensationFundEnabled ?? false}
              onChange={(event) =>
                setConfiguration((current) =>
                  current ? { ...current, compensationFundEnabled: event.target.checked } : current,
                )
              }
            />
            <span>Pago caja de compensación · 2%</span>
          </label>
        </div>
        <p className="social-security-config-note">
          IBC: 40% del neto, con piso de un SMMLV. Salud: 12,5%. Caja independiente integral: 2% cuando está activa.
          Fondo de solidaridad: cálculo automático según IBC y SMMLV, solo si pagas pensión.
        </p>
        {visibleError && (
          <p className="form-error" role="alert">
            {visibleError}
          </p>
        )}
        {message && (
          <p className="invoice-message" role="status">
            {message}
          </p>
        )}
        <div className="invoice-form-actions">
          <button type="submit" className="submit-button" disabled={saving || loading || !configuration}>
            <Save size={15} /> {saving ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </form>
    </section>
  )
}
