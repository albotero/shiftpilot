"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { format, isSameMonth } from "date-fns"
import { es } from "date-fns/locale"
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  ShieldCheck,
  Plus,
} from "lucide-react"
import { DebtSummaryCard } from "@/components/debt/DebtSummaryCard"
import { PageHeading } from "@/components/dashboard/PageHeading"
import { findScheduleConflicts, somaShiftWindows } from "@/lib/calendar/availability"
import {
  formatLongDate,
  getEntryLabel,
  getEntryTone,
  getMonthShiftHours,
  getMonthSomaShiftCount,
} from "@/lib/calendar/utils"
import { getCalendarEntries, getServerCalendarSnapshot, subscribeToCalendar } from "@/lib/calendar/storage"

type InvoiceSummary = { count: number; netAmount: number }
type SocialSecuritySummary = { ibcAmount: number }

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount)
}

export function DashboardOverview() {
  const entries = useSyncExternalStore(subscribeToCalendar, getCalendarEntries, getServerCalendarSnapshot)
  const [activeDate] = useState(() => new Date())
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary>({ count: 0, netAmount: 0 })
  const [socialSecurity, setSocialSecurity] = useState<SocialSecuritySummary | null>(null)
  const activeMonth = format(activeDate, "yyyy-MM")
  const monthEntries = entries.filter((entry) => isSameMonth(new Date(`${entry.date}T12:00:00`), activeDate))
  const shiftCount = getMonthSomaShiftCount(monthEntries, activeDate)
  const eventCount = monthEntries.filter((entry) => entry.kind === "SEDARTE" || entry.kind === "PERSONAL").length
  const shiftHours = getMonthShiftHours(entries, activeDate)
  const todayKey = format(activeDate, "yyyy-MM-dd")
  const todayEntries = entries.filter((entry) => entry.date === todayKey)
  const todaySomaEntries = todayEntries.filter((entry) => entry.kind === "SOMA")
  const todayShiftCount = getMonthSomaShiftCount(todaySomaEntries, activeDate)
  const todayShiftHours = getMonthShiftHours(todaySomaEntries, activeDate)
  const todayEventCount = todayEntries.filter((entry) => entry.kind === "SEDARTE" || entry.kind === "PERSONAL").length
  const scheduleConflicts = findScheduleConflicts(entries, somaShiftWindows)
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const upcomingEntries = entries
    .filter((entry) => entry.date >= todayKey)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 4)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/invoices?month=${activeMonth}&includeMeta=true`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el resumen de facturación.")
        const result = (await response.json()) as { summary?: InvoiceSummary }
        if (result.summary) setInvoiceSummary(result.summary)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [activeMonth])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/social-security?month=${activeMonth}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el IBC del mes.")
        const result = (await response.json()) as { period?: SocialSecuritySummary }
        setSocialSecurity(result.period ?? null)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [activeMonth])

  return (
    <>
      <PageHeading
        eyebrow={`${format(new Date(), "EEEE", { locale: es })} · Centro de control`}
        title={
          <>
            Tu tiempo, <em>bajo control.</em>
          </>
        }
        description="Turnos, compromisos y cuentas en un solo lugar."
        action={
          <Link className="primary-quick-add" href="/calendar?new=1">
            <Plus size={17} /> Nuevo registro
          </Link>
        }
      />

      <section className="stats-grid" aria-label="Resumen del mes">
        <article className="stat-card stat-shifts">
          <div className="stat-heading">
            <span>Turnos</span>
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
            <Link className="stat-card-action" href="/calendar">
              Ver calendario <ArrowUpRight size={12} />
            </Link>
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
            <Link className="stat-card-action" href="/calendar">
              Ver agenda <ArrowUpRight size={12} />
            </Link>
          </div>
        </article>
        <article className="stat-card stat-billing">
          <div className="stat-heading">
            <span>Facturado este mes</span>
            <span className="stat-icon green">
              <CircleDollarSign size={17} />
            </span>
          </div>
          <div className="stat-value stat-money">
            {formatAmount(invoiceSummary.netAmount)}
            <small>miles COP</small>
          </div>
          <div className="stat-foot">
            <span className="stat-trend green-text">
              <ArrowDownRight size={14} />
              {invoiceSummary.count === 0
                ? "Sin facturas"
                : `${invoiceSummary.count} factura${invoiceSummary.count === 1 ? "" : "s"}`}
            </span>
            <Link className="stat-card-action" href="/finance#invoices">
              Ver facturas <ArrowUpRight size={12} />
            </Link>
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
            {socialSecurity ? formatAmount(socialSecurity.ibcAmount) : "—"}
            <small>miles COP</small>
          </div>
          <div className="stat-foot">
            <span className="stat-trend violet-text">
              <Check size={14} /> 40% neto
            </span>
            <Link className="stat-card-action" href="/finance#social-security-title">
              Ver aportes <ArrowUpRight size={12} />
            </Link>
          </div>
        </article>
      </section>

      <div className="dashboard-columns overview-columns">
        <div className="overview-primary-column">
          <section className="rail-section today-summary-section">
            <div className="rail-heading">
              <div>
                <p className="eyebrow">Resumen de hoy</p>
                <h2>Actividad programada</h2>
              </div>
              <span className="live-indicator">HOY</span>
            </div>
            <div className="today-summary-metrics" aria-label="Carga de hoy">
              <div>
                <strong>{todayShiftCount}</strong>
                <span>Turnos</span>
              </div>
              <div>
                <strong>{todayShiftHours} h</strong>
                <span>Horas de turno</span>
              </div>
              <div>
                <strong>{todayEventCount}</strong>
                <span>Eventos</span>
              </div>
            </div>
            {scheduleConflicts.length > 0 && (
              <div className="conflict-notice" role="status">
                <strong>
                  {scheduleConflicts.length} conflicto{scheduleConflicts.length === 1 ? "" : "s"} de agenda
                </strong>
                <span>Revisa los horarios y períodos de vacaciones.</span>
                <details className="conflict-details">
                  <summary>Ver conflictos</summary>
                  <ul className="conflict-list">
                    {scheduleConflicts.map((conflict) => {
                      const firstEntry = entriesById.get(conflict.firstEntryId)
                      const secondEntry = entriesById.get(conflict.secondEntryId)
                      return (
                        <li key={`${conflict.date}:${conflict.firstEntryId}:${conflict.secondEntryId}`}>
                          <Link href={`/calendar?date=${conflict.date}&view=week`}>
                            <time dateTime={conflict.date}>
                              {format(new Date(`${conflict.date}T12:00:00`), "EEE d MMM", { locale: es })}
                            </time>
                            <span>
                              {firstEntry ? getEntryLabel(firstEntry) : "Actividad"} ·{" "}
                              {secondEntry ? getEntryLabel(secondEntry) : "Actividad"}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              </div>
            )}
          </section>

          <section className="rail-section upcoming-section" id="week-ahead">
            <div className="rail-heading">
              <div>
                <p className="eyebrow">Lo que viene</p>
                <h2>Próximos días</h2>
              </div>
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-upcoming">
                <span className="empty-calendar-icon">
                  <CalendarDays size={18} />
                </span>
                <p>Tu agenda está despejada.</p>
                <Link href="/calendar?new=1">
                  Agregar actividad <ArrowUpRight size={13} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <DebtSummaryCard showDetailsLink />
      </div>
    </>
  )
}
