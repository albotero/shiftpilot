"use client"

import { useState, useSyncExternalStore } from "react"
import { format, isSameMonth, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  Wallet,
} from "lucide-react"
import { CalendarPanel } from "@/components/calendar/CalendarPanel"
import { DebtSummaryCard } from "@/components/debt/DebtSummaryCard"
import { QuickAddDialog } from "@/components/calendar/QuickAddDialog"
import { findScheduleConflicts, getDayAvailability } from "@/lib/calendar/availability"
import { formatLongDate, getEntryLabel, getEntryTone, getMonthShiftHours } from "@/lib/calendar/utils"
import {
  addCalendarEntry,
  getCalendarConnection,
  getCalendarEntries,
  getServerCalendarConnection,
  getServerCalendarSnapshot,
  subscribeToCalendar,
  subscribeToStorageMode,
} from "@/lib/calendar/storage"
import type { CalendarEntry, CalendarView, EntryFilters } from "@/lib/calendar/types"

const initialFilters: EntryFilters = { SOMA: true, SEDARTE: true, PERSONAL: true, VACACIONES: true }

export function ShiftPilotDashboard() {
  const entries = useSyncExternalStore(subscribeToCalendar, getCalendarEntries, getServerCalendarSnapshot)
  const storageMode = useSyncExternalStore(subscribeToStorageMode, getCalendarConnection, getServerCalendarConnection)
  const [activeDate, setActiveDate] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>("month")
  const [filters, setFilters] = useState(initialFilters)
  const [dialogDate, setDialogDate] = useState<Date | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const monthEntries = entries.filter((entry) => isSameMonth(new Date(`${entry.date}T12:00:00`), activeDate))
  const shiftCount = monthEntries.filter((entry) => entry.kind === "SOMA" && entry.status === "TURNO").length
  const eventCount = monthEntries.filter((entry) => entry.kind === "SEDARTE" || entry.kind === "PERSONAL").length
  const shiftHours = getMonthShiftHours(entries, activeDate)
  const todayLabel = formatLongDate(new Date())
  const todayAvailability = getDayAvailability(entries, format(new Date(), "yyyy-MM-dd"))
  const scheduleConflicts = findScheduleConflicts(entries)
  const availabilityLabels = {
    SIN_REGISTRO: "Sin registro de turnos",
    LIBRE: "Libre",
    RESERVA: "Reserva Soma",
    OCUPADO: "Turno presencial",
    EVENTO: "Evento en agenda",
    VACACIONES: "Vacaciones",
  } as const
  const upcomingEntries = entries
    .filter((entry) => entry.date >= format(new Date(), "yyyy-MM-dd"))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 4)

  function createEntry(entry: CalendarEntry) {
    addCalendarEntry(entry)
    setDialogDate(null)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <a className="brand" href="#top" aria-label="ShiftPilot inicio">
          <span className="brand-mark">
            <Activity size={20} strokeWidth={2.5} />
          </span>
          <span>
            shiftpilot<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">CENTRO PERSONAL</div>
        <nav className="primary-nav" aria-label="Navegación principal">
          <a className="nav-link active" href="#top">
            <LayoutDashboard size={17} />
            <span>Resumen</span>
            <span className="nav-current" />
          </a>
          <a className="nav-link" href="#calendar">
            <CalendarDays size={17} />
            <span>Calendario</span>
          </a>
          <a className="nav-link" href="#finance">
            <Wallet size={17} />
            <span>Finanzas</span>
          </a>
          <a className="nav-link" href="#debt">
            <CreditCard size={17} />
            <span>Deuda</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className={`status-light ${storageMode}`} />
            <span>
              {storageMode === "loading"
                ? "Conectando con PostgreSQL"
                : storageMode === "database"
                  ? "PostgreSQL local conectado"
                  : "Modo de navegador · PostgreSQL sin conexión"}
            </span>
          </div>
          <a className="nav-link settings-link" href="#settings">
            <Settings2 size={17} />
            <span>Configuración</span>
          </a>
          <div className="profile-row">
            <span className="profile-avatar">S</span>
            <span className="profile-copy">
              <strong>Mi espacio</strong>
              <small>Uso personal</small>
            </span>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label="Abrir menú"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>ShiftPilot</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Resumen</strong>
          </div>
          <div className="topbar-right">
            <span className="today-date">{todayLabel}</span>
            <button className="quick-add-top" onClick={() => setDialogDate(new Date())}>
              <Plus size={16} />
              <span>Nuevo</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{format(new Date(), "EEEE", { locale: es })} · Centro de control</p>
              <h1>
                Tu tiempo, <em>bajo control.</em>
              </h1>
              <p className="welcome-subtitle">Turnos, compromisos y cuentas en un solo lugar.</p>
            </div>
            <button className="primary-quick-add" onClick={() => setDialogDate(new Date())}>
              <Plus size={17} /> Nuevo registro
            </button>
          </section>

          <section className="stats-grid" aria-label="Resumen del mes">
            <article className="stat-card stat-shifts">
              <div className="stat-heading">
                <span>Turnos presenciales</span>
                <span className="stat-icon orange">
                  <Clock3 size={17} />
                </span>
              </div>
              <div className="stat-value">
                {shiftCount}
                <small>turnos</small>
              </div>
              <div className="stat-foot">
                <span className="stat-trend">
                  <ArrowUpRight size={14} /> {shiftHours} h
                </span>
                <span>en {format(startOfMonth(activeDate), "MMMM", { locale: es })}</span>
              </div>
            </article>
            <article className="stat-card stat-events">
              <div className="stat-heading">
                <span>Eventos próximos</span>
                <span className="stat-icon blue">
                  <CalendarDays size={17} />
                </span>
              </div>
              <div className="stat-value">
                {eventCount}
                <small>eventos</small>
              </div>
              <div className="stat-foot">
                <span className="stat-trend blue-text">
                  <Activity size={14} /> Agenda
                </span>
                <span>Sedarte y personales</span>
              </div>
            </article>
            <article className="stat-card stat-billing" id="finance">
              <div className="stat-heading">
                <span>Facturado este mes</span>
                <span className="stat-icon green">
                  <CircleDollarSign size={17} />
                </span>
              </div>
              <div className="stat-value stat-money">
                —<small>miles COP</small>
              </div>
              <div className="stat-foot">
                <span className="stat-trend green-text">
                  <ArrowDownRight size={14} /> Sin facturas
                </span>
                <span>Registra tu primera</span>
              </div>
            </article>
            <article className="stat-card stat-ibc">
              <div className="stat-heading">
                <span>IBC estimado</span>
                <span className="stat-icon violet">
                  <ShieldCheck size={17} />
                </span>
              </div>
              <div className="stat-value stat-money">
                —<small>miles COP</small>
              </div>
              <div className="stat-foot">
                <span className="stat-trend violet-text">
                  <Check size={14} /> 40% neto
                </span>
                <span>Tras descuentos</span>
              </div>
            </article>
          </section>

          <div className="dashboard-columns">
            <CalendarPanel
              entries={entries}
              activeDate={activeDate}
              view={view}
              filters={filters}
              onViewChange={setView}
              onDateChange={setActiveDate}
              onAdd={setDialogDate}
              onFiltersChange={(nextFilters: EntryFilters) => setFilters(nextFilters)}
            />

            <aside className="right-rail">
              <section className="rail-section upcoming-section" id="week-ahead">
                <div className="rail-heading">
                  <div>
                    <p className="eyebrow">Lo que viene</p>
                    <h2>Próximos días</h2>
                  </div>
                  <button
                    aria-label="Agregar actividad"
                    className="small-add-button"
                    onClick={() => setDialogDate(new Date())}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {upcomingEntries.length ? (
                  <div className="upcoming-list">
                    {upcomingEntries.map((entry) => (
                      <div className="upcoming-item" key={entry.id}>
                        <span className={`upcoming-mark ${getEntryTone(entry)}`} />
                        <div className="upcoming-copy">
                          <strong>{getEntryLabel(entry)}</strong>
                          <span>
                            {formatLongDate(new Date(`${entry.date}T12:00:00`))}
                            {entry.startTime ? ` · ${entry.startTime}` : entry.period ? ` · ${entry.period}` : ""}
                          </span>
                        </div>
                        {entry.status === "TURNO" && <span className="busy-tag">Ocupado</span>}
                        {entry.status?.startsWith("R") && <span className="reserve-tag">Reserva</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-upcoming">
                    <span className="empty-calendar-icon">
                      <CalendarDays size={18} />
                    </span>
                    <p>Tu agenda está despejada.</p>
                    <button onClick={() => setDialogDate(new Date())}>
                      Agregar actividad <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
              </section>

              <section className="rail-section availability-section">
                <div className="rail-heading">
                  <div>
                    <p className="eyebrow">Estado de hoy</p>
                    <h2>Disponibilidad</h2>
                  </div>
                  <span className="live-indicator">HOY</span>
                </div>
                <div className="availability-status">
                  <span className={`availability-pulse ${todayAvailability.toLowerCase()}`} />
                  <div>
                    <strong>{availabilityLabels[todayAvailability]}</strong>
                    <span>Las reservas Soma no se marcan como disponibilidad libre.</span>
                  </div>
                </div>
                <div className="availability-legend">
                  <span>
                    <i className="legend-swatch shift" />
                    Ocupado
                  </span>
                  <span>
                    <i className="legend-swatch reservation" />
                    Reserva
                  </span>
                  <span>
                    <i className="legend-swatch vacation" />
                    Vacaciones
                  </span>
                </div>
                {scheduleConflicts.length > 0 && (
                  <div className="conflict-notice" role="status">
                    <strong>
                      {scheduleConflicts.length} conflicto{scheduleConflicts.length === 1 ? "" : "s"} de agenda
                    </strong>
                    <span>Revisa los horarios y períodos de vacaciones.</span>
                  </div>
                )}
              </section>

              <DebtSummaryCard />
            </aside>
          </div>

          <footer className="dashboard-footer" id="settings">
            <span>
              ShiftPilot <b>·</b> Valores expresados en miles de COP
            </span>
            <span>Datos locales · sin cuenta ni sincronización en nube</span>
          </footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        <a className="mobile-nav-active" href="#top">
          <LayoutDashboard size={18} />
          <span>Hoy</span>
        </a>
        <a href="#calendar">
          <CalendarDays size={18} />
          <span>Calendario</span>
        </a>
        <a href="#finance">
          <Wallet size={18} />
          <span>Finanzas</span>
        </a>
        <a href="#debt">
          <CreditCard size={18} />
          <span>Deuda</span>
        </a>
      </nav>

      {dialogDate && (
        <QuickAddDialog initialDate={dialogDate} onClose={() => setDialogDate(null)} onCreate={createEntry} />
      )}
    </div>
  )
}
