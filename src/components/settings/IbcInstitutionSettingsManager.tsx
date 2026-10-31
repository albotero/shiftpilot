"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Plus, Save } from "lucide-react"
import { normalizeInstitutionName, uniqueInstitutionNames } from "@/lib/billing/ibc-institutions"

type InstitutionSettings = { institutions: string[]; includedInstitutions: string[] }

export function IbcInstitutionSettingsManager() {
  const [institutions, setInstitutions] = useState<string[]>([])
  const [includedInstitutions, setIncludedInstitutions] = useState<string[]>([])
  const [newInstitution, setNewInstitution] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/invoices/ibc-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as InstitutionSettings & { error?: string }
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la lista de entidades.")
        if (controller.signal.aborted) return
        setInstitutions(uniqueInstitutionNames(result.institutions))
        setIncludedInstitutions(uniqueInstitutionNames(result.includedInstitutions))
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Error de consulta.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  function addInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newInstitution.trim().replace(/\s+/g, " ")
    if (!name) return
    setInstitutions((current) => uniqueInstitutionNames([...current, name]))
    setIncludedInstitutions((current) => uniqueInstitutionNames([...current, name]))
    setNewInstitution("")
    setError("")
    setMessage("")
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices/ibc-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includedInstitutions }),
      })
      const result = (await response.json()) as { includedInstitutions?: string[]; error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la configuración.")
      setIncludedInstitutions(result.includedInstitutions ?? [])
      setMessage("Entidades predeterminadas del IBC guardadas.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="annual-plan-panel" aria-labelledby="ibc-institution-settings-title">
      <div className="annual-plan-heading">
        <div>
          <p className="eyebrow">Regla predeterminada</p>
          <h2 id="ibc-institution-settings-title">Entidades incluidas en el IBC</h2>
        </div>
      </div>
      <p className="annual-plan-help">
        Las facturas nuevas de estas entidades se incluirán automáticamente. Puedes cambiar la casilla de IBC en cada
        factura.
      </p>
      {loading ? (
        <p className="invoice-empty">Consultando entidades…</p>
      ) : (
        <div className="ibc-institution-settings">
          <form className="ibc-institution-add" onSubmit={addInstitution}>
            <label className="form-field">
              <span>Agregar entidad</span>
              <input
                maxLength={160}
                value={newInstitution}
                onChange={(event) => setNewInstitution(event.target.value)}
                placeholder="Nombre según la factura"
              />
            </label>
            <button type="submit" className="invoice-secondary-button" disabled={!newInstitution.trim()}>
              <Plus size={14} /> Agregar
            </button>
          </form>
          <form onSubmit={save}>
            {institutions.length > 0 ? (
              <div className="ibc-institution-list">
                {institutions.map((institution) => (
                  <label key={institution} className="time-toggle social-security-option">
                    <input
                      type="checkbox"
                      checked={includedInstitutions.some(
                        (item) => normalizeInstitutionName(item) === normalizeInstitutionName(institution),
                      )}
                      onChange={(event) =>
                        setIncludedInstitutions((current) =>
                          event.target.checked
                            ? uniqueInstitutionNames([...current, institution])
                            : current.filter(
                                (item) => normalizeInstitutionName(item) !== normalizeInstitutionName(institution),
                              ),
                        )
                      }
                    />
                    <span>{institution}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="invoice-empty">Agrega una entidad o importa una factura para detectarla.</p>
            )}
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
            <div className="annual-plan-actions">
              <button type="submit" className="submit-button" disabled={saving}>
                <Save size={15} /> {saving ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
