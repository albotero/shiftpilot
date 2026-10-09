import { format } from "date-fns"

export function normalizeShareBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}

export function getSharedMonthUrl(date: Date, shareBaseUrl: string | null) {
  const path = `/${format(date, "yyyy")}/${format(date, "MM")}`
  return shareBaseUrl ? `${shareBaseUrl}${path}` : path
}
