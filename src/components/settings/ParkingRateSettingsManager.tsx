"use client"

import { useEffect, useState, type FormEvent } from "react"
import { format } from "date-fns"
import { CircleDollarSign, Save } from "lucide-react"

type ParkingRateResponse = { year: number; amount: number }

export function ParkingRateSettingsManager() {
  const [year, setYear] = useState(() => format(new Date(), "yyyy"))
  const [amount, setAmount] = useState("")
  const [loadedYear, setLoadedYear] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const loading = loadedYear !== year

  function selectYear(nextYear: string) {
    setYear(nextYear)
    setLoadedYear("")
    setAmount("")
    setError("")
    setMessage("")
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/parking-rates?year=${year}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la tarifa de parqueadero.")
        if (controller.signal.aborted) return
        setAmount(String((result as ParkingRateResponse).amount))
        setLoadedYear(year)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo consultar la tarifa de parqueadero.")
          setLoadedYear(year)
        }
      })
    return () => controller.abort()
  }, [year])

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/parking-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), amount: Number(amount) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la tarifa.")
      setAmount(String((result as ParkingRateResponse).amount))
      setMessage(`Tarifa de parqueadero para ${year} guardada.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la tarifa.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="annual-plan-panel" aria-labelledby="parking-rate-title">
      <div className="annual-plan-heading">
        <span className="annual-plan-icon">
          <CircleDollarSign size={18} />
        </span>
        <div>
          <p className="eyebrow">Tarifa anual</p>
          <h2 id="parking-rate-title">Parqueadero</h2>
        </div>
      </div>
      <form className="annual-plan-form" onSubmit={saveRate}>
        <div className="annual-plan-grid parking-rate-grid">
          <label className="form-field">
            <span>Año</span>
            <input
              type="number"
              min="1900"
              max="9998"
              value={year}
              onChange={(event) => selectYear(event.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>Valor por cuota · miles COP</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              disabled={loading}
            />
          </label>
        </div>
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
          <button type="submit" className="submit-button" disabled={saving || loading}>
            <Save size={15} /> {saving ? "Guardando…" : "Guardar tarifa"}
          </button>
        </div>
      </form>
    </section>
  )
}
