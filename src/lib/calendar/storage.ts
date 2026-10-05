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
      if (storageMode === "database") {
        void refreshCalendar()
        return
      }
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

export async function addCalendarEntry(entry: CalendarEntry) {
  let response: Response
  try {
    response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    })
  } catch {
    cacheEntries([...getCalendarEntries(), entry])
    setStorageMode("browser")
    return
  }

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status >= 500) {
      cacheEntries([...getCalendarEntries(), entry])
      setStorageMode("browser")
      return
    }
    throw new Error(result?.error ?? "No se pudo guardar el registro.")
  }

  const parsed = calendarEntriesSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error("La respuesta del calendario no es válida.")
  const updatedIds = new Set(parsed.data.map((updated) => updated.id))
  const nextEntries = [
    ...getCalendarEntries().filter((current) => current.id !== entry.id && !updatedIds.has(current.id)),
    ...parsed.data,
  ]
  cacheEntries(nextEntries)
  setStorageMode("database")
}

export async function updateCalendarEntry(entry: CalendarEntry) {
  if (storageMode === "browser") {
    cacheEntries(getCalendarEntries().map((current) => (current.id === entry.id ? entry : current)))
    return
  }

  let response: Response
  try {
    response = await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    })
  } catch {
    throw new Error("No se pudo conectar con PostgreSQL; el turno no se modificó.")
  }

  const result = (await response.json().catch(() => null)) as { error?: string } | CalendarEntry[] | null
  if (!response.ok) {
    throw new Error(
      result && !Array.isArray(result)
        ? (result.error ?? "No se pudo actualizar el turno.")
        : "No se pudo actualizar el turno.",
    )
  }

  const parsed = calendarEntriesSchema.safeParse(result)
  if (!parsed.success) throw new Error("La respuesta del calendario no es válida.")
  const updatedIds = new Set(parsed.data.map((updated) => updated.id))
  cacheEntries([
    ...getCalendarEntries().filter((current) => current.id !== entry.id && !updatedIds.has(current.id)),
    ...parsed.data,
  ])
  setStorageMode("database")
}

export async function deleteCalendarEntry(entry: CalendarEntry) {
  if (storageMode === "browser") {
    if (entry.kind === "SOMA") throw new Error("Restaurar la rotación requiere conexión a PostgreSQL.")
    cacheEntries(getCalendarEntries().filter((current) => current.id !== entry.id))
    return
  }

  let response: Response
  try {
    response = await fetch("/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, kind: entry.kind }),
    })
  } catch {
    throw new Error("No se pudo conectar con PostgreSQL; el registro no se eliminó.")
  }

  const result = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? "No se pudo eliminar el registro.")
  if (entry.kind === "SOMA") {
    const restoration = result as { restored?: boolean; entries?: unknown; removedIds?: unknown; error?: string } | null
    const parsedEntries = calendarEntriesSchema.safeParse(restoration?.entries)
    if (
      restoration?.restored !== true ||
      !Array.isArray(restoration.removedIds) ||
      !restoration.removedIds.every((id) => typeof id === "string") ||
      !parsedEntries.success
    ) {
      throw new Error("La respuesta de restauración no es válida.")
    }
    const replacedIds = new Set([
      entry.id,
      ...restoration.removedIds,
      ...parsedEntries.data.map((restored) => restored.id),
    ])
    cacheEntries([...getCalendarEntries().filter((current) => !replacedIds.has(current.id)), ...parsedEntries.data])
    setStorageMode("database")
    return
  }
  cacheEntries(getCalendarEntries().filter((current) => current.id !== entry.id))
  setStorageMode("database")
}

export function getServerStorageMode() {
  return "loading" as const
}

export function getCalendarConnection() {
  return storageMode
}

export async function refreshCalendar() {
  hasLoadedFromServer = false
  setStorageMode("loading")
  await loadCalendarFromServer()
}

export function getServerCalendarConnection() {
  return "loading" as const
}

export function getServerCalendarSnapshot() {
  return EMPTY_ENTRIES
}
