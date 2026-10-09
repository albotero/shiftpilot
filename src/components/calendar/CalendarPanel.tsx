"use client"

import { useState, type MouseEvent } from "react"
import { addDays, addMonths, eachDayOfInterval, format, isSameMonth, isToday, subMonths } from "date-fns"
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, FileText, Plus, Share2 } from "lucide-react"
import { es } from "date-fns/locale"
import { getColombianHoliday } from "@/lib/calendar/colombian-holidays"
import { getSharedMonthUrl } from "@/lib/calendar/share-url"
import {
  formatLongDate,
  getCalendarEntryStartMinute,
  getEntriesForDate,
  getEntryLabel,
  getEntryTone,
  getVisibleDays,
  toDateKey,
} from "@/lib/calendar/utils"
import type { CalendarEntry, CalendarEntryKind, CalendarView, EntryFilters } from "@/lib/calendar/types"

type CalendarPanelProps = {
  entries: CalendarEntry[]
  activeDate: Date
  view: CalendarView
  filters: EntryFilters
  onViewChange: (view: CalendarView) => void
  onDateChange: (date: Date) => void
  onAdd: (date: Date) => void
  onEdit: (entry: CalendarEntry) => void
  onFiltersChange: (filters: EntryFilters) => void
  shareBaseUrl: string | null
}

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const filterOrder: CalendarEntryKind[] = ["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"]
type AgendaItem = { date: string; entry: CalendarEntry } | { date: string; holiday: string }

// Phones get the native share sheet; desktop keeps opening the shared month in a new tab.
function shareMonth(event: MouseEvent<HTMLAnchorElement>, title: string) {
  const url = event.currentTarget.href
  if (typeof navigator.share !== "function" || !window.matchMedia("(pointer: coarse)").matches) return
  event.preventDefault()
  navigator.share({ title, url }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return
    window.open(url, "_blank", "noreferrer")
  })
}

export function CalendarPanel({
  entries,
  activeDate,
  view,
  filters,
  onViewChange,
  onDateChange,
  onAdd,
  onEdit,
  onFiltersChange,
  shareBaseUrl,
}: CalendarPanelProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const visibleDays = getVisibleDays(activeDate, view)
  const visibleEntries = entries.filter((entry) => filters[entry.kind])
  const agendaEnd = addDays(activeDate, 30)
  const agendaStartKey = toDateKey(activeDate)
  const agendaEndKey = toDateKey(agendaEnd)
  const agendaItems: AgendaItem[] = [
    ...visibleEntries
      .filter((entry) => entry.date >= agendaStartKey && entry.date <= agendaEndKey)
      .map((entry) => ({ date: entry.date, entry })),
    ...eachDayOfInterval({ start: activeDate, end: agendaEnd }).flatMap((day) => {
      const date = toDateKey(day)
      const holiday = getColombianHoliday(date)
      return holiday ? [{ date, holiday: holiday.name }] : []
    }),
  ].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date)
    if (dateOrder !== 0) return dateOrder
    const leftTime = "entry" in left ? getCalendarEntryStartMinute(left.entry) : 0
    const rightTime = "entry" in right ? getCalendarEntryStartMinute(right.entry) : 0
    return leftTime - rightTime
  })

  function move(direction: -1 | 1) {
    const nextDate =
      view === "week"
        ? addDays(activeDate, direction * 7)
        : view === "agenda"
          ? addDays(activeDate, direction * 30)
          : direction === 1
            ? addMonths(activeDate, 1)
            : subMonths(activeDate, 1)
    onDateChange(nextDate)
  }

  function toggleFilter(kind: CalendarEntryKind) {
    onFiltersChange({ ...filters, [kind]: !filters[kind] })
  }

  return (
    <section className="calendar-panel" id="calendar" aria-label="Calendario">
      <div className="calendar-toolbar">
        <div className="calendar-title-group">
          <div className="calendar-title-icon">
            <CalendarDays size={18} />
          </div>
          <div>
            <p className="eyebrow">Tu calendario</p>
            <input
              className="calendar-month-picker"
              type="month"
              aria-label="Seleccionar mes y año"
              value={format(activeDate, "yyyy-MM")}
              onChange={(event) => {
                const [year, month] = event.target.value.split("-").map(Number)
                if (year && month) onDateChange(new Date(year, month - 1, 1, 12))
              }}
            />
          </div>
        </div>
        <div className="calendar-actions">
          <button className="today-button" onClick={() => onDateChange(new Date())}>
            Hoy
          </button>
          <div className="month-arrows" aria-label="Navegar calendario">
            <button aria-label="Periodo anterior" onClick={() => move(-1)}>
              <ArrowLeft size={16} />
            </button>
            <button aria-label="Periodo siguiente" onClick={() => move(1)}>
              <ArrowRight size={16} />
            </button>
          </div>
          <a
            className="calendar-share-button"
            href={getSharedMonthUrl(activeDate, shareBaseUrl)}
            target="_blank"
            rel="noreferrer"
            aria-label="Compartir calendario"
            title="Compartir calendario"
            onClick={(event) => shareMonth(event, `Calendario ${format(activeDate, "MMMM yyyy", { locale: es })}`)}
          >
            <Share2 size={15} />
            <span>Compartir</span>
          </a>
          <button className="add-entry-button" onClick={() => onAdd(activeDate)}>
            <Plus size={16} /> <span>Agregar</span>
          </button>
        </div>
      </div>

      <div className="calendar-subtoolbar">
        <div className="view-switch" role="tablist" aria-label="Vista del calendario">
          {(["month", "week", "agenda"] as const).map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={view === option}
              className={view === option ? "selected" : ""}
              onClick={() => onViewChange(option)}
            >
              {option === "month" ? "Mes" : option === "week" ? "Semana" : "Agenda"}
            </button>
          ))}
        </div>
        <div className="calendar-filters" aria-label="Filtrar calendario">
          {filterOrder.map((kind) => (
            <button
              key={kind}
              className={`filter-chip ${filters[kind] ? "active" : ""} ${kind.toLowerCase()}`}
              aria-pressed={filters[kind]}
              onClick={() => toggleFilter(kind)}
            >
              <span className="filter-dot" />
              <span>{kind === "VACACIONES" ? "Vacaciones" : kind[0] + kind.slice(1).toLowerCase()}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "agenda" ? (
        <div className="agenda-view">
          {agendaItems.map((item) => {
            if ("entry" in item) {
              const entry = item.entry
              return (
                <button className="agenda-item" key={entry.id} onClick={() => onEdit(entry)}>
                  <span className="agenda-date">
                    {format(new Date(`${entry.date}T12:00:00`), "d MMM", { locale: es })}
                  </span>
                  <span className={`entry-dot ${getEntryTone(entry)}`} />
                  <span className="agenda-item-title">{getEntryLabel(entry)}</span>
                  <span className="agenda-item-detail">
                    {entry.startTime
                      ? `${entry.startTime}${entry.durationHours ? ` · ${entry.durationHours} h` : ""}`
                      : entry.kind === "SOMA"
                        ? entry.period
                        : "Día completo"}
                  </span>
                  <ChevronDown size={15} className="agenda-chevron" />
                </button>
              )
            }

            return (
              <div className="agenda-item agenda-holiday" key={`holiday-${item.date}`}>
                <span className="agenda-date">
                  {format(new Date(`${item.date}T12:00:00`), "d MMM", { locale: es })}
                </span>
                <span className="entry-dot" />
                <span className="agenda-item-title">{item.holiday}</span>
                <span className="agenda-item-detail">Festivo nacional</span>
              </div>
            )
          })}
          {agendaItems.length === 0 && (
            <div className="empty-agenda">
              <CalendarDays size={22} />
              <p>No hay actividades en este periodo.</p>
              <button onClick={() => onAdd(activeDate)}>Agregar actividad</button>
            </div>
          )}
        </div>
      ) : (
        <div className={`calendar-grid-wrap ${view === "week" ? "week-grid-wrap" : ""}`}>
          <div className="weekday-row">
            {weekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className={`calendar-grid ${view === "week" ? "week-grid" : ""}`}>
            {visibleDays.map((day) => {
              const date = toDateKey(day)
              const dayEntries = getEntriesForDate(visibleEntries, day, filters.SOMA)
              const visibleEntryLimit = view === "week" ? 4 : 3
              const isExpanded = expandedDate === date
              const hiddenEntryCount = Math.max(0, dayEntries.length - visibleEntryLimit)
              const inMonth = isSameMonth(day, activeDate)
              const holiday = getColombianHoliday(date)
              return (
                <div
                  key={date}
                  className={`calendar-day ${inMonth ? "in-month" : "outside-month"} ${isToday(day) ? "is-today" : ""} ${holiday ? "is-holiday" : ""}`}
                  onClick={() => onAdd(day)}
                  onBlur={(event) => {
                    if (
                      expandedDate === date &&
                      (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node))
                    ) {
                      setExpandedDate(null)
                    }
                  }}
                  role="group"
                  aria-label={`${formatLongDate(day)}.${holiday ? ` Festivo: ${holiday.name}.` : ""}`}
                >
                  <button
                    type="button"
                    className={`day-number ${holiday ? "holiday" : ""}`}
                    aria-label={`Agregar actividad el ${formatLongDate(day)}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onAdd(day)
                    }}
                  >
                    {format(day, "d")}
                  </button>
                  {holiday && (
                    <span className="holiday-label" title={holiday.name}>
                      {holiday.name}
                    </span>
                  )}
                  <span className="day-entries">
                    {dayEntries.slice(0, isExpanded ? dayEntries.length : visibleEntryLimit).map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        className={`day-entry ${getEntryTone(entry)} ${entry.manualOverride ? "manual-override" : ""}`}
                        title={`${getEntryLabel(entry)}${entry.location ? ` - ${entry.location}` : ""}${entry.notes?.trim() ? " · Tiene notas" : ""}`}
                        aria-label={`${entry.isFallback ? `Agregar turno ${entry.period}` : `Editar ${getEntryLabel(entry)}`}${entry.notes?.trim() ? ", tiene notas" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (entry.isFallback) onAdd(day)
                          else onEdit(entry)
                        }}
                      >
                        <span className="day-entry-label">{getEntryLabel(entry)}</span>
                        {entry.notes?.trim() && (
                          <span className="day-entry-note-indicator" aria-hidden="true">
                            <FileText size={9} />
                          </span>
                        )}
                        {entry.startTime && <span className="day-entry-time">{entry.startTime}</span>}
                      </button>
                    ))}
                    {hiddenEntryCount > 0 && (
                      <button
                        type="button"
                        className="more-entries"
                        aria-expanded={isExpanded}
                        onClick={(event) => {
                          event.stopPropagation()
                          setExpandedDate(isExpanded ? null : date)
                        }}
                      >
                        {isExpanded ? "Mostrar menos" : `+${hiddenEntryCount} más`}
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    className="day-add"
                    aria-label={`Agregar actividad el ${formatLongDate(day)}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onAdd(day)
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="calendar-footnote">
        <span>
          <i className="legend-swatch shift" />
          Turno
        </span>
        <span>
          <i className="legend-swatch reservation-range" />
          Turnos R1–R5
        </span>
        <span>
          <i className="legend-swatch other-shift" />
          Cubierto por otra persona
        </span>
        <span>
          <i className="legend-swatch borrowed-shift" />
          Turno de otra persona
        </span>
      </div>
    </section>
  )
}
