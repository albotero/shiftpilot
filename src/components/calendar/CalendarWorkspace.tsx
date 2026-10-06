"use client"

import { useState, useSyncExternalStore } from "react"
import { CalendarPanel } from "@/components/calendar/CalendarPanel"
import { QuickAddDialog } from "@/components/calendar/QuickAddDialog"
import {
  addCalendarEntry,
  deleteCalendarEntry,
  getCalendarEntries,
  getServerCalendarSnapshot,
  subscribeToCalendar,
  updateCalendarEntry,
} from "@/lib/calendar/storage"
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
  const [dialogDate, setDialogDate] = useState<Date | null>(() => (openNew ? new Date() : null))
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null)

  function startNewEntry(date: Date) {
    setEditingEntry(null)
    setDialogDate(date)
  }

  function startEditingEntry(entry: CalendarEntry) {
    setEditingEntry(entry)
    setDialogDate(new Date(`${entry.date}T12:00:00`))
  }

  async function saveEntry(entry: CalendarEntry) {
    if (editingEntry) await updateCalendarEntry(entry)
    else await addCalendarEntry(entry)
    setDialogDate(null)
    setEditingEntry(null)
  }

  async function removeEntry(entry: CalendarEntry) {
    await deleteCalendarEntry(entry)
    setDialogDate(null)
    setEditingEntry(null)
  }

  return (
    <>
      <CalendarPanel
        entries={entries}
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
