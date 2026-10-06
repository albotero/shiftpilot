"use client"

import { useEffect, useState, type FormEvent } from "react"
import { format } from "date-fns"
import { Save } from "lucide-react"
import type { ArlRiskClass, SocialSecurityConfiguration } from "@/lib/social-security/calculations"

type SettingsResponse = { configuration: SocialSecurityConfiguration }

export function SocialSecuritySettingsManager() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const [configuration, setConfiguration] = useState<SocialSecurityConfiguration | null>(null)
  const [loadedMonth, setLoadedMonth] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const loading = loadedMonth !== month

  function selectMonth(nextMonth: string) {
    setConfiguration(null)
    setLoadedMonth("")
    setError("")
    setMessage("")
    setMonth(nextMonth)
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/social-security?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la configuración del mes.")
        if (controller.signal.aborted) return
        setConfiguration((result as SettingsResponse).configuration)
        setLoadedMonth(month)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo consultar la configuración del mes.")
          setLoadedMonth(month)
        }
      })
    return () => controller.abort()
  }, [month])

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
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la configuración.")
      setConfiguration((result as SettingsResponse).configuration)
      setMessage(`Configuración de ${month} guardada. Solo afecta este mes.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="social-security-panel" aria-labelledby="social-security-settings-title">
      <div className="social-security-heading settings-social-security-heading">
        <div>
          <p className="eyebrow">Configuración mensual</p>
          <h2 id="social-security-settings-title">Aportes de seguridad social</h2>
        </div>
        <label className="finance-month-picker">
          <span>Mes</span>
          <input
            type="month"
            aria-label="Mes de configuración"
            value={month}
            onChange={(event) => selectMonth(event.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="invoice-empty">Consultando configuración…</p>
      ) : configuration ? (
        <form className="social-security-rates" onSubmit={saveConfiguration}>
          <div className="social-security-rate-grid">
            <label className="time-toggle social-security-option">
              <input
                type="checkbox"
                checked={configuration.pensionEnabled}
                onChange={(event) =>
                  setConfiguration((current) => current && { ...current, pensionEnabled: event.target.checked })
                }
              />
              <span>Pago pensión · 16%</span>
            </label>
            <label className="time-toggle social-security-option">
              <input
                type="checkbox"
                checked={configuration.arlEnabled}
                onChange={(event) =>
                  setConfiguration((current) => current && { ...current, arlEnabled: event.target.checked })
                }
              />
              <span>Pago ARL</span>
            </label>
            {configuration.arlEnabled && (
              <label className="form-field">
                <span>Clase de riesgo ARL</span>
                <select
                  value={configuration.arlRiskClass}
                  onChange={(event) =>
                    setConfiguration(
                      (current) => current && { ...current, arlRiskClass: event.target.value as ArlRiskClass },
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
                checked={configuration.compensationFundEnabled}
                onChange={(event) =>
                  setConfiguration(
                    (current) => current && { ...current, compensationFundEnabled: event.target.checked },
                  )
                }
              />
              <span>Pago caja de compensación · 2%</span>
            </label>
          </div>
          <p className="social-security-config-note">
            IBC: 40% del neto, con piso de un SMMLV. Salud: 12,5%. Caja independiente integral: 2% cuando está activa.
            El fondo de solidaridad se calcula según el IBC y el SMMLV del mes seleccionado.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="invoice-message" role="status">
              {message}
            </p>
          )}
          <div className="invoice-form-actions">
            <button type="submit" className="submit-button" disabled={saving || !configuration}>
              <Save size={15} /> {saving ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </form>
      ) : (
        error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )
      )}
    </section>
  )
}
