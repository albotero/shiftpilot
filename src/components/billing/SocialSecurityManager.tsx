"use client"

import { useEffect, useState } from "react"
import type { SocialSecurityConfiguration, SocialSecurityRates } from "@/lib/social-security/calculations"

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
  const [loadedMonth, setLoadedMonth] = useState("")
  const [loadError, setLoadError] = useState<{ month: string; message: string } | null>(null)
  const loading = loadedMonth !== month
  const visibleError = loadError?.month === month ? loadError.message : ""

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/social-security?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "No se pudo consultar seguridad social.")
        const parsed = data as SocialSecurityResponse
        setResult(parsed)
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

      {visibleError && (
        <p className="form-error" role="alert">
          {visibleError}
        </p>
      )}
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
    </section>
  )
}
