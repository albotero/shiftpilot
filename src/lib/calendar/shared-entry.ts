import type { CalendarEntry } from "./types"

export const SHARED_SEDATION_TITLE = "Sedación"

export function toSharedCalendarEntry(entry: CalendarEntry): CalendarEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notes, location, ...shared } = entry
  return entry.kind === "SEDARTE" ? { ...shared, title: SHARED_SEDATION_TITLE } : shared
}
