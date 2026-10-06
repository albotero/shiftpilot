import Link from "next/link"
import { notFound } from "next/navigation"
import { addMonths, format, isSameMonth, isToday, subMonths } from "date-fns"
import { es } from "date-fns/locale"
import { ChevronLeft, ChevronRight, LayoutDashboard } from "lucide-react"
import { getColombianHoliday } from "@/lib/calendar/colombian-holidays"
import {
  formatLongDate,
  getEntriesForDate,
  getEntryLabel,
  getEntryTone,
  getVisibleDays,
  toDateKey,
} from "@/lib/calendar/utils"
import { expandWeeklyRecurrence } from "@/lib/calendar/recurrence"
import type { CalendarEntry, ShiftPeriod } from "@/lib/calendar/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
type PageProps = { params: Promise<{ year: string; month: string }> }
type ShiftRecordPeriod = Exclude<ShiftPeriod, "AM + PM">

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getMonthPath(date: Date) {
  return `/${format(date, "yyyy")}/${format(date, "MM")}`
}

function mapShift(shift: {
  id: string
  date: Date
  status: string
  period: ShiftRecordPeriod
  manualOverride: boolean
  anesthesiologist: string | null
  notes: string | null
  coverages: { person: { id: string; name: string } }[]
}): CalendarEntry {
  const replacement = shift.coverages[0]?.person
  return {
    id: shift.id,
    date: dateKey(shift.date),
    kind: "SOMA",
    status: shift.status as CalendarEntry["status"],
    period: shift.period,
    manualOverride: shift.manualOverride,
    ...(replacement
      ? { replacementPersonId: replacement.id, anesthesiologist: replacement.name }
      : shift.anesthesiologist
        ? { anesthesiologist: shift.anesthesiologist }
        : {}),
    ...(shift.notes ? { notes: shift.notes } : {}),
    title: shift.status,
  }
}

export default async function SharedMonthPage({ params }: PageProps) {
  const { year: yearText, month: monthText } = await params
  if (!/^\d{4}$/.test(yearText) || !/^\d{2}$/.test(monthText)) notFound()

  const year = Number(yearText)
  const month = Number(monthText)
  if (year < 1900 || year > 9998 || month < 1 || month > 12) notFound()

  const monthDate = new Date(year, month - 1, 1, 12)
  const visibleDays = getVisibleDays(monthDate, "month")
  const rangeStart = new Date(`${toDateKey(visibleDays[0])}T00:00:00.000Z`)
  const rangeEnd = new Date(`${toDateKey(visibleDays[visibleDays.length - 1])}T00:00:00.000Z`)
  const [shifts, events, vacations, recurrences] = await Promise.all([
    prisma.shift.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      include: { coverages: { include: { person: true } } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
    }),
    prisma.event.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.vacation.findMany({
      where: {
        startDate: { lte: rangeEnd },
        OR: [{ endDate: { gte: rangeStart } }, { endDate: null }],
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.calendarRecurrence.findMany({
      where: {
        startDate: { lte: rangeEnd },
        OR: [{ endDate: null }, { endDate: { gte: rangeStart } }],
      },
      include: { exceptions: { where: { date: { gte: rangeStart, lte: rangeEnd } } } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const entries: CalendarEntry[] = [
    ...shifts.map(mapShift),
    ...events.map((event) => ({
      id: event.id,
      date: dateKey(event.date),
      kind: event.category,
      title: event.title,
      ...(event.startTime ? { startTime: event.startTime } : {}),
      ...(event.durationMinutes !== null ? { durationHours: event.durationMinutes / 60 } : {}),
      ...(event.location ? { location: event.location } : {}),
      ...(event.notes ? { notes: event.notes } : {}),
    })),
    ...vacations.map((vacation) => ({
      id: vacation.id,
      date: dateKey(vacation.startDate),
      ...(vacation.endDate ? { endDate: dateKey(vacation.endDate) } : {}),
      ...(vacation.annualPlanYear ? { annualPlanYear: vacation.annualPlanYear } : {}),
      kind: "VACACIONES" as const,
      title: "VACACIONES",
      ...(vacation.notes ? { notes: vacation.notes } : {}),
    })),
    ...recurrences.flatMap((rule) =>
      expandWeeklyRecurrence(
        {
          id: rule.id,
          kind: rule.kind,
          frequency: rule.frequency,
          startDate: dateKey(rule.startDate),
          endDate: rule.endDate ? dateKey(rule.endDate) : null,
          weekday: rule.weekday ?? undefined,
          weekdays: rule.weekdays,
          dayOfMonth: rule.dayOfMonth,
          lastDayOfMonth: rule.lastDayOfMonth,
          intervalDays: rule.intervalDays,
          skipHolidays: rule.skipHolidays,
          title: rule.title,
          ...(rule.status ? { status: rule.status as CalendarEntry["status"] } : {}),
          ...(rule.period ? { period: rule.period } : {}),
          ...(rule.startTime ? { startTime: rule.startTime } : {}),
          ...(rule.durationMinutes ? { durationMinutes: rule.durationMinutes } : {}),
          ...(rule.location ? { location: rule.location } : {}),
          ...(rule.notes ? { notes: rule.notes } : {}),
        },
        dateKey(visibleDays[0]),
        dateKey(visibleDays[visibleDays.length - 1]),
        rule.exceptions.map((exception) => ({
          date: dateKey(exception.date),
          title: exception.title,
          status: exception.status,
          period: exception.period,
          startTime: exception.startTime,
          durationMinutes: exception.durationMinutes,
          location: exception.location,
          notes: exception.notes,
        })),
      ),
    ),
  ]

  const previousMonth = subMonths(monthDate, 1)
  const nextMonth = addMonths(monthDate, 1)

  return (
    <main className="shared-calendar-page">
      <div className="shared-calendar-content">
        <header className="shared-calendar-header">
          <Link className="shared-calendar-home" href="/" aria-label="Volver a ShiftPilot">
            <span className="shared-calendar-mark">
              <LayoutDashboard size={17} />
            </span>
            <span>ShiftPilot</span>
          </Link>
          <nav className="shared-month-navigation" aria-label="Navegación mensual">
            {year === 1900 && month === 1 ? (
              <span className="shared-month-arrow disabled" aria-hidden="true">
                <ChevronLeft size={18} />
              </span>
            ) : (
              <Link className="shared-month-arrow" href={getMonthPath(previousMonth)} aria-label="Mes anterior">
                <ChevronLeft size={18} />
              </Link>
            )}
            <h1>{format(monthDate, "MMMM yyyy", { locale: es })}</h1>
            {year === 9998 && month === 12 ? (
              <span className="shared-month-arrow disabled" aria-hidden="true">
                <ChevronRight size={18} />
              </span>
            ) : (
              <Link className="shared-month-arrow" href={getMonthPath(nextMonth)} aria-label="Mes siguiente">
                <ChevronRight size={18} />
              </Link>
            )}
          </nav>
        </header>

        <section
          className="shared-calendar-panel"
          aria-label={`Calendario de ${format(monthDate, "MMMM yyyy", { locale: es })}`}
        >
          <div className="shared-calendar-legend" aria-label="Leyenda">
            <span>
              <i className="legend-swatch shift" /> Turno
            </span>
            <span>
              <i className="legend-swatch reservation" /> Reserva R1–R5
            </span>
            <span>
              <i className="legend-swatch other-shift" /> Te cubren
            </span>
            <span>
              <i className="legend-swatch borrowed-shift" /> Cubres a otra persona
            </span>
            <span>
              <i className="legend-swatch sedarte" /> Sedarte
            </span>
            <span>
              <i className="legend-swatch personal" /> Personal
            </span>
            <span>
              <i className="legend-swatch vacation" /> Vacaciones
            </span>
          </div>
          <div className="calendar-grid-wrap shared-calendar-grid-wrap">
            <div className="weekday-row">
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {visibleDays.map((day) => {
                const date = toDateKey(day)
                const dayEntries = getEntriesForDate(entries, day)
                const holiday = getColombianHoliday(date)
                return (
                  <div
                    key={date}
                    className={`calendar-day ${isSameMonth(day, monthDate) ? "in-month" : "outside-month"} ${isToday(day) ? "is-today" : ""}`}
                    role="group"
                    aria-label={`${formatLongDate(day)}${holiday ? `. Festivo: ${holiday.name}` : ""}`}
                  >
                    <span className={`day-number ${holiday ? "holiday" : ""}`}>{format(day, "d")}</span>
                    {holiday && (
                      <span className="holiday-label" title={holiday.name}>
                        {holiday.name}
                      </span>
                    )}
                    <div className="day-entries">
                      {dayEntries.map((entry) => {
                        const details = [
                          entry.startTime
                            ? `${entry.startTime}${entry.durationHours ? ` · ${entry.durationHours} h` : ""}`
                            : "",
                          entry.location,
                          entry.notes,
                        ].filter(Boolean)
                        return (
                          <div className="shared-entry" key={entry.id}>
                            <div
                              className={`day-entry ${getEntryTone(entry)}`}
                              title={[getEntryLabel(entry), ...details].join(" · ")}
                            >
                              <span className="day-entry-label">{getEntryLabel(entry)}</span>
                              {entry.startTime && <span className="day-entry-time">{entry.startTime}</span>}
                            </div>
                            {details.length > 0 && (
                              <details className="shared-entry-details">
                                <summary>Detalles</summary>
                                <div>
                                  {details.map((detail, index) => (
                                    <span key={`${entry.id}-detail-${index}`}>{detail}</span>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
