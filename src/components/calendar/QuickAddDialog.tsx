"use client"

import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { calendarEntrySchema } from "@/lib/calendar/schema"
import { toDateKey } from "@/lib/calendar/utils"
import type { CalendarEntry, CalendarEntryKind, ShiftPeriod, SomaStatus } from "@/lib/calendar/types"

type QuickAddDialogProps = {
  initialDate: Date
  onClose: () => void
  onCreate: (entry: CalendarEntry) => void
}

const shiftStatuses: SomaStatus[] = ["TURNO", "R4", "R3", "R2", "R1", "LIBRE"]

export function QuickAddDialog({ initialDate, onClose, onCreate }: QuickAddDialogProps) {
  const [kind, setKind] = useState<CalendarEntryKind>("SOMA")
  const [status, setStatus] = useState<SomaStatus>("TURNO")
  const [period, setPeriod] = useState<ShiftPeriod>("AM")
  const [date, setDate] = useState(toDateKey(initialDate))
  const [endDate, setEndDate] = useState(toDateKey(initialDate))
  const [title, setTitle] = useState("")
  const [startTime, setStartTime] = useState("08:00")
  const [durationHours, setDurationHours] = useState("2")
  const [hasTime, setHasTime] = useState(true)
  const [location, setLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry = {
      id: crypto.randomUUID(),
      date,
      ...(kind === "VACACIONES" && endDate !== date ? { endDate } : {}),
      kind,
      ...(kind === "SOMA" ? { status, period } : {}),
      title: kind === "SOMA" ? status : title.trim() || (kind === "SEDARTE" ? "Evento Sedarte" : "Evento personal"),
      ...(kind === "SEDARTE" || (kind === "PERSONAL" && hasTime)
        ? { startTime, durationHours: Number(durationHours) }
        : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    const parsed = calendarEntrySchema.safeParse(entry)

    if (!parsed.success || (kind === "VACACIONES" && endDate < date)) {
      setError("Revisa las fechas y los datos del registro.")
      return
    }

    onCreate(parsed.data)
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="quick-add-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Registro nuevo</p>
            <h2 id="quick-add-title">Agregar al calendario</h2>
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="quick-add-form">
          <label className="form-field">
            <span>Tipo</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as CalendarEntryKind)}>
              <option value="SOMA">Soma · turno o reserva</option>
              <option value="SEDARTE">Evento Sedarte</option>
              <option value="PERSONAL">Evento personal</option>
              <option value="VACACIONES">Vacaciones</option>
            </select>
          </label>

          {kind === "SOMA" && (
            <div className="form-row">
              <label className="form-field">
                <span>Estado</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as SomaStatus)}>
                  {shiftStatuses.map((item) => (
                    <option key={item} value={item}>
                      {item === "TURNO" ? "Turno presencial" : item}
                    </option>
                  ))}
                </select>
              </label>
              {status !== "LIBRE" && (
                <label className="form-field">
                  <span>Jornada</span>
                  <select value={period} onChange={(event) => setPeriod(event.target.value as ShiftPeriod)}>
                    <option value="AM">AM · 6 h</option>
                    <option value="PM">PM · 6 h</option>
                    <option value="AM + PM">AM + PM · 12 h</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {kind !== "SOMA" && kind !== "VACACIONES" && (
            <>
              <label className="form-field">
                <span>Título</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder={kind === "SEDARTE" ? "Ej. Procedimiento" : "Ej. Cita médica"}
                />
              </label>
              {kind === "PERSONAL" && (
                <label className="time-toggle">
                  <input type="checkbox" checked={hasTime} onChange={(event) => setHasTime(event.target.checked)} />
                  <span>Este compromiso tiene horario</span>
                </label>
              )}
              {(kind === "SEDARTE" || hasTime) && (
                <div className="form-row">
                  <label className="form-field">
                    <span>Hora inicial</span>
                    <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Duración · horas</span>
                    <input
                      type="number"
                      min="0.25"
                      max="24"
                      step="0.25"
                      value={durationHours}
                      onChange={(event) => setDurationHours(event.target.value)}
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {kind === "VACACIONES" && (
            <label className="form-field">
              <span>Último día</span>
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
          )}

          <div className="form-row">
            <label className="form-field">
              <span>{kind === "VACACIONES" ? "Primer día" : "Fecha"}</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            {kind !== "SOMA" && kind !== "VACACIONES" && (
              <label className="form-field">
                <span>Lugar · opcional</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={100}
                  placeholder="Lugar"
                />
              </label>
            )}
          </div>

          <label className="form-field">
            <span>Notas · opcional</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="cancel-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="submit-button">
              Guardar registro
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
