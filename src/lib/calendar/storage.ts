import { calendarEntriesSchema } from "./schema"
import type { CalendarEntry } from "./types"

const STORAGE_KEY = "shiftpilot.calendar.v1"
const EMPTY_ENTRIES: CalendarEntry[] = []
const listeners = new Set<() => void>()
const modeListeners = new Set<() => void>()
let cachedEntries: CalendarEntry[] | null = null
let storageMode: "loading" | "database" | "browser" = "loading"
let hasLoadedFromServer = false

function notifyEntries() {
  listeners.forEach((listener) => listener())
}

function setStorageMode(mode: "loading" | "database" | "browser") {
  storageMode = mode
  modeListeners.forEach((listener) => listener())
}

function cacheEntries(entries: CalendarEntry[]) {
  cachedEntries = entries
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    cachedEntries = entries
  }
  notifyEntries()
}

async function loadCalendarFromServer() {
  if (hasLoadedFromServer || typeof window === "undefined") return
  hasLoadedFromServer = true

  try {
    const response = await fetch("/api/calendar", { cache: "no-store" })
    if (!response.ok) throw new Error("Calendar API unavailable")
    const parsed = calendarEntriesSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error("Invalid calendar response")
    cacheEntries(parsed.data)
    setStorageMode("database")
  } catch {
    setStorageMode("browser")
  }
}

export function getCalendarEntries() {
  if (typeof window === "undefined") return EMPTY_ENTRIES
  if (cachedEntries) return cachedEntries

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = calendarEntriesSchema.safeParse(JSON.parse(stored))
      if (parsed.success) cachedEntries = parsed.data
      else window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  cachedEntries ??= EMPTY_ENTRIES
  return cachedEntries
}

export function subscribeToCalendar(listener: () => void) {
  listeners.add(listener)
  void loadCalendarFromServer()
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cachedEntries = null
      listener()
    }
  }

  window.addEventListener("storage", handleStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", handleStorage)
  }
}

export function subscribeToStorageMode(listener: () => void) {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

export function addCalendarEntry(entry: CalendarEntry) {
  return fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Calendar API unavailable")
      const parsed = calendarEntriesSchema.safeParse(await response.json())
      if (!parsed.success) throw new Error("Invalid calendar response")
      const nextEntries = [...getCalendarEntries().filter((current) => current.id !== entry.id), ...parsed.data]
      cacheEntries(nextEntries)
      setStorageMode("database")
    })
    .catch(() => {
      cacheEntries([...getCalendarEntries(), entry])
      setStorageMode("browser")
    })
}

export function getServerStorageMode() {
  return "loading" as const
}

export function getCalendarConnection() {
  return storageMode
}

export function getServerCalendarConnection() {
  return "loading" as const
}

export function getServerCalendarSnapshot() {
  return EMPTY_ENTRIES
}
