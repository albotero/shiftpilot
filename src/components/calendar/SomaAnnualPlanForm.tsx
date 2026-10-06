"use client"

import { useState, type FormEvent } from "react"
import { CalendarRange, Save } from "lucide-react"
import { DateInput } from "@/components/forms/DateInput"
import { refreshCalendar } from "@/lib/calendar/storage"
import type { SomaStatus } from "@/lib/calendar/types"

type YearEndMode = "UNPLANNED" | "ALTERNATE"

type SavedPlan = {
  year: number
  mainStartDate: string
  mainEndDate: string
  anchorDate: string
  anchorStatus: SomaStatus
  yearEndMode: YearEndMode
}

const statusOptions: SomaStatus[] = ["TURNO", "R1", "R2", "R3", "R4"]

export function SomaAnnualPlanForm() {
  const [year, setYear] = useState("2026")
  const [mainStartDate, setMainStartDate] = useState("2026-01-13")
  const [mainEndDate, setMainEndDate] = useState("2026-12-23")
  const [anchorDate, setAnchorDate] = useState("2026-10-01")
  const [anchorStatus, setAnchorStatus] = useState<SomaStatus | "">("TURNO")
  const [yearEndMode, setYearEndMode] = useState<YearEndMode | "">("UNPLANNED")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function selectYear(value: string) {
    setYear(value)
    setMessage("")
    setError("")
    const selectedYear = Number(value)
    if (!Number.isInteger(selectedYear) || selectedYear < 1900 || selectedYear > 9998) return

    try {
      const response = await fetch(`/api/soma/annual-plan?year=${selectedYear}`, { cache: "no-store" })
      if (!response.ok) throw new Error("No se pudo consultar el plan anual.")
      const plan = (await response.json()) as SavedPlan | null
      if (plan) {
        setMainStartDate(plan.mainStartDate)
        setMainEndDate(plan.mainEndDate)
        setAnchorDate(plan.anchorDate)
        setAnchorStatus(plan.anchorStatus)
        setYearEndMode(plan.yearEndMode)
        return
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el plan anual.")
    }

    setMainStartDate(`${selectedYear}-01-01`)
    setMainEndDate(`${selectedYear}-12-31`)
    setAnchorDate("")
    setAnchorStatus("")
    setYearEndMode("")
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    setError("")

    try {
      const response = await fetch("/api/soma/annual-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          mainStartDate,
          mainEndDate,
          anchorDate,
          anchorStatus,
          yearEndMode,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el plan anual.")

      await refreshCalendar()
      const inserted = result.insertedMainShifts + result.insertedSpecialShifts
      const yearEndMessage = result.yearEndWindow.endDate
        ? `bloque especial hasta ${result.yearEndWindow.endDate}`
        : yearEndMode === "ALTERNATE"
          ? "secuencia alterna pendiente de definir el plan del siguiente año"
          : "resto del periodo sin vacaciones programadas"
      setMessage(`Plan ${year} guardado. ${inserted} jornadas nuevas; ${yearEndMessage}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el plan anual.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="annual-plan-panel" id="settings" aria-labelledby="annual-plan-title">
      <div className="annual-plan-heading">
        <span className="annual-plan-icon">
          <CalendarRange size={18} />
        </span>
        <div>
          <p className="eyebrow">Configuración por año</p>
          <h2 id="annual-plan-title">Plan anual de Soma</h2>
        </div>
      </div>
      <form className="annual-plan-form" onSubmit={savePlan}>
        <div className="annual-plan-grid">
          <label className="form-field">
            <span>Año</span>
            <input
              type="number"
              min="1900"
              max="9998"
              value={year}
              onChange={(event) => void selectYear(event.target.value)}
              required
            />
          </label>
          <div className="form-field">
            <label htmlFor="annual-plan-start-date">Inicio de secuencia principal</label>
            <DateInput
              id="annual-plan-start-date"
              ariaLabel="Inicio de secuencia principal"
              value={mainStartDate}
              onChange={setMainStartDate}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="annual-plan-end-date">Fin de secuencia principal</label>
            <DateInput
              id="annual-plan-end-date"
              ariaLabel="Fin de secuencia principal"
              value={mainEndDate}
              onChange={setMainEndDate}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="annual-plan-anchor-date">Fecha ancla de la rotación</label>
            <DateInput
              id="annual-plan-anchor-date"
              ariaLabel="Fecha ancla de la rotación"
              value={anchorDate}
              onChange={setAnchorDate}
              required
            />
          </div>
          <label className="form-field">
            <span>Estado en la fecha ancla</span>
            <select
              value={anchorStatus}
              onChange={(event) => setAnchorStatus(event.target.value as SomaStatus | "")}
              required
            >
              <option value="">Selecciona un estado</option>
              {statusOptions.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Bloque especial al cierre</span>
            <select
              value={yearEndMode}
              onChange={(event) => setYearEndMode(event.target.value as YearEndMode | "")}
              required
            >
              <option value="">Selecciona una regla</option>
              <option value="UNPLANNED">Sin secuencia especial</option>
              <option value="ALTERNATE">Secuencia alterna R2 · R1 · TURNO</option>
            </select>
          </label>
        </div>
        <p className="annual-plan-help">
          El ciclo alterno R2 · R1 · TURNO ocupa el intervalo entre planes anuales. Si eliges “Sin secuencia especial”,
          ese intervalo queda sin programar; las vacaciones se agregan cuando se solicitan, en semanas completas.
          Festivos colombianos y reglas de fin de semana se aplican automáticamente.
        </p>
        {message && (
          <p className="annual-plan-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="annual-plan-actions">
          <button type="submit" className="submit-button" disabled={saving}>
            <Save size={15} />
            {saving ? "Guardando plan…" : "Guardar plan y turnos"}
          </button>
        </div>
      </form>
    </section>
  )
}
