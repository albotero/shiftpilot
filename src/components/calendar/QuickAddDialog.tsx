"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { RotateCcw, Trash2, X } from "lucide-react"
import { DateInput } from "@/components/forms/DateInput"
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

type ReplacementPerson = { id: string; name: string; active: boolean }
type SomaFormStatus = SomaStatus | "AUTOMATICO"
const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const weekdayInitials = ["D", "L", "M", "X", "J", "V", "S"]

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
  const [status, setStatus] = useState<SomaFormStatus>(() =>
    initialEntry?.kind === "SOMA"
      ? initialEntry.manualOverride
        ? (initialEntry.status ?? "R5")
        : "AUTOMATICO"
      : "AUTOMATICO",
  )
  const [period, setPeriod] = useState<ShiftPeriod>(
    initialEntry?.recurrencePeriod === "AM_PM"
      ? "AM + PM"
      : initialEntry?.period === "AM + PM"
        ? "AM"
        : (initialEntry?.period ?? "AM"),
  )
  const [date, setDate] = useState(initialEntry?.date ?? toDateKey(initialDate))
  const [repeatWeekly, setRepeatWeekly] = useState(Boolean(initialEntry?.recurrenceId))
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(initialEntry?.recurrenceFrequency ?? "WEEKLY")
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>(
    initialEntry?.recurrenceWeekdays ??
      (initialEntry?.recurrenceWeekday === undefined ? [] : [initialEntry.recurrenceWeekday]),
  )
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(
    initialEntry?.recurrenceDayOfMonth ?? Number((initialEntry?.date ?? toDateKey(initialDate)).slice(-2)),
  )
  const [recurrenceLastDayOfMonth, setRecurrenceLastDayOfMonth] = useState(
    Boolean(initialEntry?.recurrenceLastDayOfMonth),
  )
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(initialEntry?.recurrenceIntervalDays ?? 1)
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initialEntry?.recurrenceEndDate ?? "")
  const [skipHolidays, setSkipHolidays] = useState(Boolean(initialEntry?.skipHolidays))
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
  const [replacementPersonId, setReplacementPersonId] = useState(initialEntry?.replacementPersonId ?? "")
  const [amReplacementPersonId, setAmReplacementPersonId] = useState("")
  const [pmReplacementPersonId, setPmReplacementPersonId] = useState("")
  const [replacementPeople, setReplacementPeople] = useState<ReplacementPerson[]>([])
  const [loadingReplacementPeople, setLoadingReplacementPeople] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<CalendarEntry | null>(null)
  const canDelete = Boolean(
    initialEntry?.recurrenceId ||
    (initialEntry &&
      initialEntry.kind !== "SOMA" &&
      !(initialEntry.kind === "VACACIONES" && initialEntry.annualPlanYear)),
  )
  const canRestoreRotation = Boolean(
    initialEntry?.kind === "SOMA" && initialEntry.manualOverride && !initialEntry.recurrenceId,
  )
  const isCoverageStatus = status === "TURNO_OTRA_PERSONA" || status === "TURNO_DE_OTRA_PERSONA"
  const showCurrentStatus = Boolean(
    initialEntry?.kind === "SOMA" &&
    initialEntry.manualOverride &&
    initialEntry.status &&
    !shiftStatuses.includes(initialEntry.status),
  )

  useEffect(() => {
    if (!isCoverageStatus) return
    let active = true
    fetch("/api/replacement-people?includeInactive=true", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo cargar el catálogo.")
        if (active) setReplacementPeople(result as ReplacementPerson[])
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el catálogo.")
      })
      .finally(() => {
        if (active) setLoadingReplacementPeople(false)
      })
    return () => {
      active = false
    }
  }, [isCoverageStatus])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      kind === "SOMA" &&
      status !== "AUTOMATICO" &&
      !shiftStatuses.includes(status) &&
      status !== initialEntry?.status
    ) {
      setError("Selecciona un tipo de turno manual.")
      return
    }
    if (kind === "VACACIONES" && (!Number.isInteger(vacationWeeks) || vacationWeeks < 1 || !date)) {
      setError("Indica una fecha inicial y una o más semanas completas.")
      return
    }
    if (kind === "SOMA" && isCoverageStatus) {
      const selectedAmPersonId = amReplacementPersonId || replacementPersonId
      const selectedPmPersonId = pmReplacementPersonId || replacementPersonId
      if (period === "AM + PM" ? !selectedAmPersonId || !selectedPmPersonId : !replacementPersonId) {
        setError("Selecciona el anestesiólogo para cada jornada cubierta.")
        return
      }
    }
    if (repeatWeekly && kind === "SOMA" && (status === "AUTOMATICO" || isCoverageStatus)) {
      setError("Selecciona un turno Soma propio para repetir.")
      return
    }
    if (repeatWeekly && recurrenceEndDate && recurrenceEndDate < date) {
      setError("La fecha final debe ser igual o posterior al inicio.")
      return
    }
    if (repeatWeekly && recurrenceFrequency === "WEEKLY" && recurrenceWeekdays.length === 0) {
      setError("Selecciona al menos un día de la semana.")
      return
    }
    if (
      repeatWeekly &&
      recurrenceFrequency === "INTERVAL" &&
      (!Number.isInteger(recurrenceIntervalDays) || recurrenceIntervalDays < 1)
    ) {
      setError("Indica cada cuántos días debe repetirse.")
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

    const shouldRepeatWeekly = repeatWeekly && (kind === "SOMA" || kind === "PERSONAL")
    const entry = {
      id: initialEntry?.id ?? createEntryId(),
      date,
      ...(shouldRepeatWeekly
        ? {
            repeatWeekly: true,
            ...(initialEntry?.recurrenceId ? { recurrenceId: initialEntry.recurrenceId } : {}),
            recurrenceStartDate: initialEntry?.recurrenceStartDate ?? date,
            recurrenceEndDate: recurrenceEndDate || null,
            recurrenceFrequency,
            recurrenceWeekday: recurrenceFrequency === "WEEKLY" ? recurrenceWeekdays[0] : undefined,
            recurrenceWeekdays: recurrenceFrequency === "WEEKLY" ? recurrenceWeekdays : [],
            recurrenceDayOfMonth: recurrenceFrequency === "MONTHLY" ? recurrenceDayOfMonth : undefined,
            recurrenceLastDayOfMonth: recurrenceFrequency === "MONTHLY" && recurrenceLastDayOfMonth,
            recurrenceIntervalDays: recurrenceFrequency === "INTERVAL" ? recurrenceIntervalDays : undefined,
            skipHolidays,
            ...(kind === "SOMA" ? { recurrencePeriod: period === "AM + PM" ? "AM_PM" : period } : {}),
          }
        : {}),
      ...(vacationEndDate ? { endDate: vacationEndDate } : {}),
      kind,
      ...(kind === "SOMA"
        ? {
            ...(status === "AUTOMATICO" ? { restoreAutomatic: true } : { status }),
            period,
            ...(isCoverageStatus && period === "AM + PM"
              ? {
                  amReplacementPersonId: amReplacementPersonId || replacementPersonId,
                  pmReplacementPersonId: pmReplacementPersonId || replacementPersonId,
                }
              : isCoverageStatus && replacementPersonId
                ? { replacementPersonId }
                : {}),
          }
        : {}),
      title:
        kind === "SOMA"
          ? status === "AUTOMATICO"
            ? (initialEntry?.title ?? "Automático")
            : (statusLabels[status] ?? status)
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

    if (initialEntry?.recurrenceId) {
      setPendingEdit(parsed.data)
      setError("")
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

  async function saveRecurringEdit(scope: "OCCURRENCE" | "THIS_AND_FUTURE") {
    if (!pendingEdit) return
    setSaving(true)
    setError("")
    try {
      await onSave({ ...pendingEdit, recurrenceEditScope: scope })
      setPendingEdit(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo modificar la serie.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(scope?: "ALL" | "FUTURE") {
    if (!initialEntry || !onDelete) return
    if (initialEntry.recurrenceId && !scope) {
      setConfirmDelete(true)
      return
    }
    if (!initialEntry.recurrenceId && !confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    setError("")
    try {
      await onDelete(scope ? { ...initialEntry, recurrenceDeleteScope: scope } : initialEntry)
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
            <h2 id="quick-add-title">
              {initialEntry?.recurrenceId
                ? "Editar serie semanal"
                : isEditing
                  ? "Editar registro"
                  : "Agregar al calendario"}
            </h2>
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
              onChange={(event) => {
                const nextKind = event.target.value as CalendarEntryKind
                setKind(nextKind)
                if (nextKind !== "SOMA" && nextKind !== "PERSONAL") setRepeatWeekly(false)
              }}
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
                    value={status}
                    onChange={(event) => {
                      const nextStatus = event.target.value as SomaFormStatus
                      setStatus(nextStatus)
                      if (nextStatus === "NOCHE") setPeriod("NOCHE")
                      else if (
                        period === "NOCHE" &&
                        nextStatus !== "AUTOMATICO" &&
                        nextStatus !== "TURNO_OTRA_PERSONA" &&
                        nextStatus !== "TURNO_DE_OTRA_PERSONA" &&
                        nextStatus !== "EXTERNO_NOCHE"
                      ) {
                        setPeriod("AM")
                      }
                      setError("")
                    }}
                  >
                    {!repeatWeekly && <option value="AUTOMATICO">Automático</option>}
                    {showCurrentStatus && initialEntry?.status && (
                      <option value={initialEntry.status}>
                        {statusLabels[initialEntry.status] ?? initialEntry.status}
                      </option>
                    )}
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
                    {(status === "AUTOMATICO" ||
                      period === "NOCHE" ||
                      isCoverageStatus ||
                      status === "NOCHE" ||
                      status === "EXTERNO_NOCHE") && <option value="NOCHE">NOCHE · 12 h</option>}
                  </select>
                </label>
              </div>
              {isCoverageStatus &&
                (period === "AM + PM" ? (
                  <div className="form-row">
                    {(["AM", "PM"] as const).map((half) => (
                      <label className="form-field" key={half}>
                        <span>
                          {half} · {status === "TURNO_OTRA_PERSONA" ? "¿Quién te cubre?" : "¿De quién es el turno?"}
                        </span>
                        <select
                          value={
                            half === "AM"
                              ? amReplacementPersonId || replacementPersonId
                              : pmReplacementPersonId || replacementPersonId
                          }
                          disabled={loadingReplacementPeople}
                          onChange={(event) => {
                            if (half === "AM") setAmReplacementPersonId(event.target.value)
                            else setPmReplacementPersonId(event.target.value)
                          }}
                          required
                        >
                          <option value="">Selecciona anestesiólogo</option>
                          {replacementPeople
                            .filter(
                              (person) =>
                                person.active ||
                                person.id ===
                                  (half === "AM"
                                    ? amReplacementPersonId || replacementPersonId
                                    : pmReplacementPersonId || replacementPersonId),
                            )
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="form-field">
                    <span>{status === "TURNO_OTRA_PERSONA" ? "¿Quién te cubre?" : "¿De quién es el turno?"}</span>
                    <select
                      value={replacementPersonId}
                      disabled={loadingReplacementPeople}
                      onChange={(event) => setReplacementPersonId(event.target.value)}
                      required
                    >
                      <option value="">Selecciona anestesiólogo</option>
                      {replacementPeople
                        .filter((person) => person.active || person.id === replacementPersonId)
                        .map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              {isCoverageStatus && !loadingReplacementPeople && replacementPeople.every((person) => !person.active) && (
                <p className="replacement-people-hint">
                  No hay anestesiólogos activos. <Link href="/settings">Agrégalos en Configuración.</Link>
                </p>
              )}
            </>
          )}

          {(kind === "SOMA" || kind === "PERSONAL") && (
            <>
              <label className="time-toggle recurrence-option-toggle">
                <input
                  type="checkbox"
                  checked={repeatWeekly}
                  disabled={Boolean(initialEntry?.recurrenceId)}
                  onChange={(event) => {
                    setRepeatWeekly(event.target.checked)
                    if (event.target.checked && status === "AUTOMATICO") setStatus("R5")
                    setError("")
                  }}
                />
                <span>{initialEntry?.recurrenceId ? "Serie recurrente" : "Repetir"}</span>
              </label>
              {repeatWeekly && (
                <>
                  <div className="form-row">
                    <label className="form-field">
                      <span>Frecuencia</span>
                      <select
                        value={recurrenceFrequency}
                        onChange={(event) => setRecurrenceFrequency(event.target.value as typeof recurrenceFrequency)}
                      >
                        <option value="WEEKLY">Cada semana</option>
                        <option value="MONTHLY">Cada mes</option>
                        <option value="INTERVAL">Cada N días</option>
                      </select>
                    </label>
                    <div className="form-field">
                      <label htmlFor="recurrence-end-date">Repetir hasta · opcional</label>
                      <DateInput
                        id="recurrence-end-date"
                        ariaLabel="Fecha final de repetición"
                        value={recurrenceEndDate}
                        onChange={setRecurrenceEndDate}
                      />
                    </div>
                  </div>
                  {recurrenceFrequency === "WEEKLY" && (
                    <fieldset className="form-field">
                      <legend>Días de la semana</legend>
                      <div className="recurrence-weekdays">
                        {weekdays.map((weekday, index) => (
                          <label className="time-toggle recurrence-weekday" key={weekday} title={weekday}>
                            <input
                              type="checkbox"
                              aria-label={weekday}
                              checked={recurrenceWeekdays.includes(index)}
                              onChange={(event) => {
                                setRecurrenceWeekdays((selected) =>
                                  event.target.checked
                                    ? [...selected, index].sort((left, right) => left - right)
                                    : selected.filter((day) => day !== index),
                                )
                                setError("")
                              }}
                            />
                            <span aria-hidden="true">{weekdayInitials[index]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {recurrenceFrequency === "MONTHLY" && (
                    <div className="form-row">
                      <label className="form-field">
                        <span>Repetir el</span>
                        <select
                          value={recurrenceLastDayOfMonth ? "LAST" : "DAY"}
                          onChange={(event) => setRecurrenceLastDayOfMonth(event.target.value === "LAST")}
                        >
                          <option value="DAY">Día específico</option>
                          <option value="LAST">Último día del mes</option>
                        </select>
                      </label>
                      {!recurrenceLastDayOfMonth && (
                        <label className="form-field">
                          <span>Día del mes</span>
                          <select
                            value={recurrenceDayOfMonth}
                            onChange={(event) => setRecurrenceDayOfMonth(Number(event.target.value))}
                          >
                            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                  {recurrenceFrequency === "INTERVAL" && (
                    <label className="form-field">
                      <span>Repetir cada · días</span>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        step="1"
                        value={recurrenceIntervalDays}
                        onChange={(event) => setRecurrenceIntervalDays(Number(event.target.value))}
                      />
                    </label>
                  )}
                  <label className="time-toggle recurrence-option-toggle">
                    <input
                      type="checkbox"
                      checked={skipHolidays}
                      onChange={(event) => setSkipHolidays(event.target.checked)}
                    />
                    <span>Omitir festivos nacionales de Colombia</span>
                  </label>
                </>
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
              <div className="form-field">
                <label htmlFor="vacation-start-date">Fecha inicial</label>
                <DateInput
                  id="vacation-start-date"
                  ariaLabel="Fecha inicial"
                  value={date}
                  onChange={setDate}
                  required
                />
              </div>
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
              <div className="form-field vacation-calculated-end">
                <label htmlFor="vacation-end-date">Fecha final calculada</label>
                <DateInput
                  id="vacation-end-date"
                  ariaLabel="Fecha final calculada"
                  value={
                    date && Number.isInteger(vacationWeeks) && vacationWeeks > 0
                      ? getVacationEndDate(date, vacationWeeks)
                      : ""
                  }
                  readOnly
                />
              </div>
            </div>
          ) : (
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="calendar-entry-date">Fecha</label>
                <DateInput
                  id="calendar-entry-date"
                  ariaLabel="Fecha"
                  value={date}
                  onChange={setDate}
                  readOnly={Boolean(initialEntry?.recurrenceId)}
                  required
                />
              </div>
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
          {pendingEdit && (
            <div className="delete-confirmation" role="alert">
              <span>¿Qué quieres modificar? Las ocurrencias pasadas se conservarán.</span>
              <button
                type="button"
                className="confirm-delete-button"
                onClick={() => void saveRecurringEdit("OCCURRENCE")}
                disabled={saving}
              >
                Solo este evento
              </button>
              <button
                type="button"
                className="confirm-delete-button"
                onClick={() => void saveRecurringEdit("THIS_AND_FUTURE")}
                disabled={saving}
              >
                Este y los futuros
              </button>
              <button
                type="button"
                className="cancel-delete-button"
                onClick={() => setPendingEdit(null)}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          )}
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
                  : initialEntry?.recurrenceId
                    ? "¿Qué quieres eliminar? Puedes conservar los eventos pasados."
                    : "¿Eliminar este registro? Esta acción no se puede deshacer."}
              </span>
              {initialEntry?.recurrenceId ? (
                <>
                  <button
                    type="button"
                    className="confirm-delete-button"
                    onClick={() => void deleteEntry("ALL")}
                    disabled={saving}
                  >
                    Toda la serie, incluidos pasados
                  </button>
                  <button
                    type="button"
                    className="confirm-delete-button"
                    onClick={() => void deleteEntry("FUTURE")}
                    disabled={saving}
                  >
                    Solo este evento y los futuros
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="confirm-delete-button"
                  onClick={() => void deleteEntry()}
                  disabled={saving}
                >
                  {canRestoreRotation ? "Sí, restaurar" : "Sí, eliminar"}
                </button>
              )}
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
                {canRestoreRotation ? "Restaurar rotación" : initialEntry?.recurrenceId ? "Eliminar serie" : "Eliminar"}
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
