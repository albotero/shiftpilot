"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Save } from "lucide-react"
import type { SocialSecurityRates } from "@/lib/social-security/calculations"

type Period = {
  grossAmount: number
  discounts: number
  netAmount: number
  ibcAmount: number
  healthAmountTenths: number
  pensionAmountTenths: number
  arlAmountTenths: number
  fundAmountTenths: number
  totalAmountTenths: number
}

type SocialSecurityResponse = {
  month: string
  rates: SocialSecurityRates
  minimumWage: { year: number; sourceYear: number; amountCop: number; sourceUrl: string; stale: boolean }
  period: Period
}
type RateDraft = Record<keyof SocialSecurityRates, string>

const rateFields: { key: keyof SocialSecurityRates; label: string }[] = [
  { key: "ibcRatePpm", label: "IBC · %" },
  { key: "healthRatePpm", label: "Salud · %" },
  { key: "pensionRatePpm", label: "Pensión · %" },
  { key: "arlRatePpm", label: "ARL · %" },
  { key: "fundRatePpm", label: "Caja · %" },
]

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

function formatPesos(amountCop: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amountCop)
}

function toRateDraft(rates: SocialSecurityRates): RateDraft {
  return Object.fromEntries(rateFields.map(({ key }) => [key, String(rates[key] / 10_000)])) as RateDraft
}

function fromRateDraft(draft: RateDraft): SocialSecurityRates | null {
  if (rateFields.some(({ key }) => draft[key].trim() === "")) return null
  const values = Object.fromEntries(
    rateFields.map(({ key }) => [key, Number(draft[key]) * 10_000]),
  ) as SocialSecurityRates
  if (Object.values(values).some((value) => !Number.isInteger(value) || value < 0 || value > 1_000_000)) return null
  return values
}

export function SocialSecurityManager({ month, refreshToken }: { month: string; refreshToken: number }) {
  const [result, setResult] = useState<SocialSecurityResponse | null>(null)
  const [rateDraft, setRateDraft] = useState<RateDraft | null>(null)
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
        setRateDraft(toRateDraft(parsed.rates))
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

  async function saveRates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rateDraft) return
    const rates = fromRateDraft(rateDraft)
    if (!rates) {
      setError("Las tasas deben estar entre 0 y 100% y usar hasta tres decimales.")
      return
    }

    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/social-security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, rates }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "No se pudieron guardar las tasas.")
      const saved = data as SocialSecurityResponse
      setResult(saved)
      setRateDraft(toRateDraft(saved.rates))
      setMessage("Tasas guardadas y período recalculado.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar las tasas.")
    } finally {
      setSaving(false)
    }
  }

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
            {result.minimumWage.stale
              ? `Último SMMLV oficial verificado (${result.minimumWage.sourceYear})`
              : `SMMLV ${result.minimumWage.year}`}
            : <strong>{formatPesos(result.minimumWage.amountCop)} COP</strong>
            {result.minimumWage.stale && <span> · valor pendiente de actualizar con MinTrabajo</span>}
            <span aria-hidden="true"> · </span>
            <a href={result.minimumWage.sourceUrl} target="_blank" rel="noreferrer">
              Fuente oficial
            </a>
          </p>

          <div className="social-security-contributions" aria-label="Aportes calculados">
            {[
              ["Salud", result.rates.healthRatePpm, result.period.healthAmountTenths],
              ["Pensión", result.rates.pensionRatePpm, result.period.pensionAmountTenths],
              ["ARL", result.rates.arlRatePpm, result.period.arlAmountTenths],
              ["Caja", result.rates.fundRatePpm, result.period.fundAmountTenths],
            ].map(([label, rate, amount]) => (
              <div className="social-security-contribution" key={label}>
                <span>{label}</span>
                <span>{(Number(rate) / 10_000).toLocaleString("es-CO", { maximumFractionDigits: 3 })}%</span>
                <strong>{formatAmount(Number(amount) / 10)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <form className="social-security-rates" onSubmit={saveRates}>
        <h3>Tasas configurables</h3>
        <div className="social-security-rate-grid">
          {rateFields.map(({ key, label }) => (
            <label className="form-field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min="0"
                max="100"
                required
                step="0.001"
                value={rateDraft?.[key] ?? ""}
                onChange={(event) =>
                  setRateDraft((current) => (current ? { ...current, [key]: event.target.value } : current))
                }
              />
            </label>
          ))}
        </div>
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
          <button type="submit" className="submit-button" disabled={saving || loading || !rateDraft}>
            <Save size={15} /> {saving ? "Guardando…" : "Guardar tasas"}
          </button>
        </div>
      </form>
    </section>
  )
}
