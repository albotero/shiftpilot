"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { addDays } from "date-fns"
import { CalendarPanel } from "@/components/calendar/CalendarPanel"
import { QuickAddDialog } from "@/components/calendar/QuickAddDialog"
import {
  addCalendarEntry,
  deleteCalendarEntry,
  getCalendarEntries,
  saveCalendarRecurrence,
  getServerCalendarSnapshot,
  subscribeToCalendar,
  updateCalendarEntry,
} from "@/lib/calendar/storage"
import { calendarEntriesSchema } from "@/lib/calendar/schema"
import { getVisibleDays, toDateKey } from "@/lib/calendar/utils"
import type { CalendarEntry, CalendarView, EntryFilters } from "@/lib/calendar/types"

const initialFilters: EntryFilters = { SOMA: true, SEDARTE: true, PERSONAL: true, VACACIONES: true }

export function CalendarWorkspace({
  initialDate,
  initialView,
  openNew,
}: {
  initialDate: string | null
  initialView: CalendarView
  openNew: boolean
}) {
  const entries = useSyncExternalStore(subscribeToCalendar, getCalendarEntries, getServerCalendarSnapshot)
  const [activeDate, setActiveDate] = useState(() => (initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()))
  const [view, setView] = useState(initialView)
  const [filters, setFilters] = useState(initialFilters)
  const [recurringEntries, setRecurringEntries] = useState<CalendarEntry[]>([])
  const [recurrenceRevision, setRecurrenceRevision] = useState(0)
  const [dialogDate, setDialogDate] = useState<Date | null>(() => (openNew ? new Date() : null))
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null)
  const visibleDays = view === "agenda" ? [activeDate, addDays(activeDate, 30)] : getVisibleDays(activeDate, view)
  const recurrenceRange = {
    from: toDateKey(visibleDays[0]),
    to: toDateKey(visibleDays[visibleDays.length - 1]),
  }

  useEffect(() => {
    let active = true
    fetch(`/api/calendar/recurrences?from=${recurrenceRange.from}&to=${recurrenceRange.to}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar las series recurrentes")
        const parsed = calendarEntriesSchema.safeParse(await response.json())
        if (!parsed.success) throw new Error("La respuesta de recurrencias no es válida")
        if (active) setRecurringEntries(parsed.data)
      })
      .catch(() => {
        if (active) setRecurringEntries([])
      })
    return () => {
      active = false
    }
  }, [recurrenceRange.from, recurrenceRange.to, recurrenceRevision])

  function startNewEntry(date: Date) {
    setEditingEntry(null)
    setDialogDate(date)
  }

  function startEditingEntry(entry: CalendarEntry) {
    setEditingEntry(entry)
    setDialogDate(new Date(`${entry.date}T12:00:00`))
  }

  async function saveEntry(entry: CalendarEntry) {
    if (entry.repeatWeekly || entry.recurrenceId) {
      await saveCalendarRecurrence(entry)
      setRecurrenceRevision((revision) => revision + 1)
    } else if (editingEntry) await updateCalendarEntry(entry)
    else await addCalendarEntry(entry)
    setDialogDate(null)
    setEditingEntry(null)
  }

  async function removeEntry(entry: CalendarEntry) {
    await deleteCalendarEntry(entry)
    if (entry.recurrenceId) setRecurrenceRevision((revision) => revision + 1)
    setDialogDate(null)
    setEditingEntry(null)
  }

  return (
    <>
      <CalendarPanel
        entries={[...entries, ...recurringEntries]}
        activeDate={activeDate}
        view={view}
        filters={filters}
        onViewChange={setView}
        onDateChange={setActiveDate}
        onAdd={startNewEntry}
        onEdit={startEditingEntry}
        onFiltersChange={setFilters}
      />
      {dialogDate && (
        <QuickAddDialog
          initialDate={dialogDate}
          initialEntry={editingEntry}
          onClose={() => {
            setDialogDate(null)
            setEditingEntry(null)
          }}
          onSave={saveEntry}
          onDelete={removeEntry}
        />
      )}
    </>
  )
}
