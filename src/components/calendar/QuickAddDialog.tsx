"use client"

import { useState, type FormEvent } from "react"
import { RotateCcw, Trash2, X } from "lucide-react"
import { calendarEntrySchema } from "@/lib/calendar/schema"
import { toDateKey } from "@/lib/calendar/utils"
import { getVacationEndDate, getVacationWeekCount } from "@/lib/calendar/vacation-weeks"
import type { CalendarEntry, CalendarEntryKind, ShiftPeriod, SomaStatus } from "@/lib/calendar/types"

type QuickAddDialogProps = {
  initialDate: Date
  initialEntry?: CalendarEntry | null
  onClose: () => void
  onSave: (entry: CalendarEntry) => Promise<void>
  onDelete?: (entry: CalendarEntry) => Promise<void>
}

const shiftStatuses: SomaStatus[] = [
  "R5",
  "NOCHE",
  "TURNO_OTRA_PERSONA",
  "TURNO_DE_OTRA_PERSONA",
  "EXTERNO",
  "EXTERNO_NOCHE",
]

const statusLabels: Partial<Record<SomaStatus, string>> = {
  R5: "Adicional",
  NOCHE: "NOCHE",
  TURNO_OTRA_PERSONA: "Cubierto por otra persona",
  TURNO_DE_OTRA_PERSONA: "Turno de otra persona",
  EXTERNO: "Externo",
  EXTERNO_NOCHE: "Externo noche",
}

function createEntryId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function QuickAddDialog({ initialDate, initialEntry, onClose, onSave, onDelete }: QuickAddDialogProps) {
  const isEditing = Boolean(initialEntry)
  const [kind, setKind] = useState<CalendarEntryKind>(initialEntry?.kind ?? "SOMA")
  const [status, setStatus] = useState<SomaStatus>(initialEntry?.status ?? "R5")
  const [period, setPeriod] = useState<ShiftPeriod>(
    initialEntry?.period === "AM + PM" ? "AM" : (initialEntry?.period ?? "AM"),
  )
  const [date, setDate] = useState(initialEntry?.date ?? toDateKey(initialDate))
  const [vacationWeeks, setVacationWeeks] = useState(() => {
    if (!initialEntry?.endDate) return 1
    try {
      return getVacationWeekCount(initialEntry.date, initialEntry.endDate)
    } catch {
      return 1
    }
  })
  const [title, setTitle] = useState(initialEntry?.title ?? "")
  const [startTime, setStartTime] = useState(initialEntry?.startTime ?? "08:00")
  const [durationHours, setDurationHours] = useState(String(initialEntry?.durationHours ?? 2))
  const [hasTime, setHasTime] = useState(initialEntry?.kind === "SEDARTE" || Boolean(initialEntry?.startTime))
  const [location, setLocation] = useState(initialEntry?.location ?? "")
  const [notes, setNotes] = useState(initialEntry?.notes ?? "")
  const [anesthesiologist, setAnesthesiologist] = useState(initialEntry?.anesthesiologist ?? "")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = Boolean(
    initialEntry &&
    initialEntry.kind !== "SOMA" &&
    !(initialEntry.kind === "VACACIONES" && initialEntry.annualPlanYear),
  )
  const canRestoreRotation = Boolean(initialEntry?.kind === "SOMA" && initialEntry.manualOverride)
  const isCoverageStatus = status === "TURNO_OTRA_PERSONA" || status === "TURNO_DE_OTRA_PERSONA"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (kind === "SOMA" && !shiftStatuses.includes(status)) {
      setError("Selecciona un tipo de turno manual.")
      return
    }
    if (kind === "VACACIONES" && (!Number.isInteger(vacationWeeks) || vacationWeeks < 1 || !date)) {
      setError("Indica una fecha inicial y una o más semanas completas.")
      return
    }

    let vacationEndDate: string | undefined
    if (kind === "VACACIONES") {
      try {
        vacationEndDate = getVacationEndDate(date, vacationWeeks)
      } catch {
        setError("Indica una fecha inicial y una o más semanas completas.")
        return
      }
    }

    const entry = {
      id: initialEntry?.id ?? createEntryId(),
      date,
      ...(vacationEndDate ? { endDate: vacationEndDate } : {}),
      kind,
      ...(kind === "SOMA"
        ? {
            status,
            period,
            ...(isCoverageStatus && anesthesiologist.trim() ? { anesthesiologist: anesthesiologist.trim() } : {}),
          }
        : {}),
      title:
        kind === "SOMA"
          ? (statusLabels[status] ?? status)
          : title.trim() || (kind === "SEDARTE" ? "Evento Sedarte" : "Evento personal"),
      ...(kind === "SEDARTE" || (kind === "PERSONAL" && hasTime)
        ? { startTime, durationHours: Number(durationHours) }
        : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    const parsed = calendarEntrySchema.safeParse(entry)

    if (!parsed.success) {
      setError("Revisa las fechas y los datos del registro.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await onSave(parsed.data)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el registro.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry() {
    if (!initialEntry || !onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    setError("")
    try {
      await onDelete(initialEntry)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : canRestoreRotation
            ? "No se pudo restaurar la rotación."
            : "No se pudo eliminar el registro.",
      )
    } finally {
      setSaving(false)
    }
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
            <h2 id="quick-add-title">{isEditing ? "Editar registro" : "Agregar al calendario"}</h2>
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="quick-add-form">
          <label className="form-field">
            <span>Tipo</span>
            <select
              value={kind}
              disabled={isEditing}
              onChange={(event) => setKind(event.target.value as CalendarEntryKind)}
            >
              <option value="SOMA">Soma</option>
              <option value="SEDARTE">Evento Sedarte</option>
              <option value="PERSONAL">Evento personal</option>
              <option value="VACACIONES">Vacaciones</option>
            </select>
          </label>

          {kind === "SOMA" && (
            <>
              <div className="form-row">
                <label className="form-field">
                  <span>Tipo de turno o reserva</span>
                  <select
                    value={shiftStatuses.includes(status) ? status : ""}
                    onChange={(event) => {
                      const nextStatus = event.target.value as SomaStatus
                      setStatus(nextStatus)
                      if (nextStatus === "NOCHE") setPeriod("NOCHE")
                      else if (
                        period === "NOCHE" &&
                        nextStatus !== "TURNO_OTRA_PERSONA" &&
                        nextStatus !== "TURNO_DE_OTRA_PERSONA" &&
                        nextStatus !== "EXTERNO_NOCHE"
                      ) {
                        setPeriod("AM")
                      }
                      setError("")
                    }}
                  >
                    <option value="" disabled>
                      Elige tipo de turno
                    </option>
                    {shiftStatuses.map((item) => (
                      <option key={item} value={item}>
                        {statusLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Jornada</span>
                  <select value={period} onChange={(event) => setPeriod(event.target.value as ShiftPeriod)}>
                    <option value="AM">AM · 6 h</option>
                    <option value="PM">PM · 6 h</option>
                    <option value="AM + PM">AM + PM · 12 h</option>
                    {(status === "NOCHE" || isCoverageStatus || status === "EXTERNO_NOCHE") && (
                      <option value="NOCHE">NOCHE · 12 h</option>
                    )}
                  </select>
                </label>
              </div>
              {isCoverageStatus && (
                <label className="form-field">
                  <span>{status === "TURNO_OTRA_PERSONA" ? "¿Quién te cubre?" : "¿De quién es el turno?"}</span>
                  <input
                    value={anesthesiologist}
                    onChange={(event) => setAnesthesiologist(event.target.value)}
                    maxLength={100}
                    placeholder="Nombre del anestesiólogo"
                  />
                </label>
              )}
            </>
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

          {kind === "VACACIONES" ? (
            <div className="form-row">
              <label className="form-field">
                <span>Fecha inicial</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    const nextDate = event.target.value
                    setDate(nextDate)
                  }}
                  required
                />
              </label>
              <label className="form-field">
                <span>Semanas completas</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={vacationWeeks}
                  onChange={(event) => {
                    const weeks = Number(event.target.value)
                    setVacationWeeks(weeks)
                  }}
                  required
                />
              </label>
              <label className="form-field vacation-calculated-end">
                <span>Fecha final calculada</span>
                <input
                  type="date"
                  value={
                    date && Number.isInteger(vacationWeeks) && vacationWeeks > 0
                      ? getVacationEndDate(date, vacationWeeks)
                      : ""
                  }
                  readOnly
                />
              </label>
            </div>
          ) : (
            <div className="form-row">
              <label className="form-field">
                <span>Fecha</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </label>
              {kind !== "SOMA" && (
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
          )}

          <label className="form-field">
            <span>Notas · opcional</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {confirmDelete && (
            <div className={`delete-confirmation ${canRestoreRotation ? "restore-confirmation" : ""}`} role="alert">
              <span>
                {canRestoreRotation
                  ? "¿Restaurar la rotación automática? Si no hay turno programado, se quitará el ajuste manual."
                  : "¿Eliminar este registro? Esta acción no se puede deshacer."}
              </span>
              <button
                type="button"
                className="confirm-delete-button"
                onClick={() => void deleteEntry()}
                disabled={saving}
              >
                {canRestoreRotation ? "Sí, restaurar" : "Sí, eliminar"}
              </button>
              <button
                type="button"
                className="cancel-delete-button"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
              >
                Conservar
              </button>
            </div>
          )}
          <div className="dialog-actions">
            {(canDelete || canRestoreRotation) && onDelete && (
              <button
                type="button"
                className={canRestoreRotation ? "delete-button restore-button" : "delete-button"}
                onClick={() => void deleteEntry()}
                disabled={saving}
              >
                {canRestoreRotation ? <RotateCcw size={15} /> : <Trash2 size={15} />}
                {canRestoreRotation ? "Restaurar rotación" : "Eliminar"}
              </button>
            )}
            <button type="button" className="cancel-button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Guardar registro"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
