"use client";

import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isToday,
  subMonths,
} from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Plus,
} from "lucide-react";
import { es } from "date-fns/locale";
import {
  formatLongDate,
  formatMonth,
  getEntriesForDate,
  getEntryLabel,
  getEntryTone,
  getVisibleDays,
  toDateKey,
} from "@/lib/calendar/utils";
import type {
  CalendarEntry,
  CalendarEntryKind,
  CalendarView,
  EntryFilters,
} from "@/lib/calendar/types";

type CalendarPanelProps = {
  entries: CalendarEntry[];
  activeDate: Date;
  view: CalendarView;
  filters: EntryFilters;
  onViewChange: (view: CalendarView) => void;
  onDateChange: (date: Date) => void;
  onAdd: (date: Date) => void;
  onFiltersChange: (filters: EntryFilters) => void;
};

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const filterOrder: CalendarEntryKind[] = ["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"];

export function CalendarPanel({
  entries,
  activeDate,
  view,
  filters,
  onViewChange,
  onDateChange,
  onAdd,
  onFiltersChange,
}: CalendarPanelProps) {
  const visibleDays = getVisibleDays(activeDate, view);
  const visibleEntries = entries.filter((entry) => filters[entry.kind]);

  function move(direction: -1 | 1) {
    const nextDate = view === "week"
      ? addDays(activeDate, direction * 7)
      : view === "agenda"
        ? addDays(activeDate, direction * 30)
        : direction === 1
          ? addMonths(activeDate, 1)
          : subMonths(activeDate, 1);
    onDateChange(nextDate);
  }

  function toggleFilter(kind: CalendarEntryKind) {
    onFiltersChange({ ...filters, [kind]: !filters[kind] });
  }

  return (
    <section className="calendar-panel" id="calendar" aria-label="Calendario">
      <div className="calendar-toolbar">
        <div className="calendar-title-group">
          <div className="calendar-title-icon"><CalendarDays size={18} /></div>
          <div>
            <p className="eyebrow">Tu calendario</p>
            <h2>{formatMonth(activeDate)}</h2>
          </div>
        </div>
        <div className="calendar-actions">
          <button className="today-button" onClick={() => onDateChange(new Date())}>Hoy</button>
          <div className="month-arrows" aria-label="Navegar calendario">
            <button aria-label="Periodo anterior" onClick={() => move(-1)}><ArrowLeft size={16} /></button>
            <button aria-label="Periodo siguiente" onClick={() => move(1)}><ArrowRight size={16} /></button>
          </div>
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
          {visibleEntries
            .filter((entry) => entry.date >= toDateKey(activeDate) && entry.date <= toDateKey(addDays(activeDate, 30)))
            .sort((left, right) => left.date.localeCompare(right.date))
            .map((entry) => (
              <button className="agenda-item" key={entry.id} onClick={() => onAdd(new Date(`${entry.date}T12:00:00`))}>
                <span className="agenda-date">{format(new Date(`${entry.date}T12:00:00`), "d MMM", { locale: es })}</span>
                <span className={`entry-dot ${getEntryTone(entry)}`} />
                <span className="agenda-item-title">{getEntryLabel(entry)}</span>
                <span className="agenda-item-detail">
                  {entry.startTime ? `${entry.startTime}${entry.durationHours ? ` · ${entry.durationHours} h` : ""}` : entry.kind === "SOMA" ? entry.period : "Día completo"}
                </span>
                <ChevronDown size={15} className="agenda-chevron" />
              </button>
            ))}
          {visibleEntries.filter((entry) => entry.date >= toDateKey(activeDate) && entry.date <= toDateKey(addDays(activeDate, 30))).length === 0 && (
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
            {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className={`calendar-grid ${view === "week" ? "week-grid" : ""}`}>
            {visibleDays.map((day) => {
              const dayEntries = getEntriesForDate(visibleEntries, day);
              const inMonth = isSameMonth(day, activeDate);
              return (
                <button
                  key={toDateKey(day)}
                  className={`calendar-day ${inMonth ? "in-month" : "outside-month"} ${isToday(day) ? "is-today" : ""}`}
                  onClick={() => onAdd(day)}
                  aria-label={`${formatLongDate(day)}. Agregar actividad`}
                >
                  <span className="day-number">{format(day, "d")}</span>
                  <span className="day-entries">
                    {dayEntries.slice(0, view === "week" ? 4 : 3).map((entry) => (
                      <span key={entry.id} className={`day-entry ${getEntryTone(entry)}`} title={getEntryLabel(entry)}>
                        <span className="day-entry-label">{getEntryLabel(entry)}</span>
                        {entry.startTime && <span className="day-entry-time">{entry.startTime}</span>}
                      </span>
                    ))}
                    {dayEntries.length > (view === "week" ? 4 : 3) && (
                      <span className="more-entries">+{dayEntries.length - (view === "week" ? 4 : 3)} más</span>
                    )}
                  </span>
                  <span className="day-add"><Plus size={13} /></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="calendar-footnote">
        <span><i className="legend-swatch shift" />Turno presencial bloquea disponibilidad</span>
        <span><i className="legend-swatch reservation" />R1–R4 son reservas Soma</span>
      </div>
    </section>
  );
}