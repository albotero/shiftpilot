import { describe, expect, it } from "vitest"
import { getSharedMonthUrl, normalizeShareBaseUrl } from "@/lib/calendar/share-url"

const october = new Date(2026, 9, 9, 12)

describe("shared calendar URL", () => {
  it("uses the configured public origin", () => {
    const base = normalizeShareBaseUrl("https://calendario.albotero.com/")
    expect(getSharedMonthUrl(october, base)).toBe("https://calendario.albotero.com/2026/10")
  })

  it("ignores paths in the configured value", () => {
    expect(normalizeShareBaseUrl("https://calendario.albotero.com/otra/ruta")).toBe("https://calendario.albotero.com")
  })

  it("falls back to the app-relative path when unset or invalid", () => {
    expect(getSharedMonthUrl(october, normalizeShareBaseUrl(undefined))).toBe("/2026/10")
    expect(getSharedMonthUrl(october, normalizeShareBaseUrl(""))).toBe("/2026/10")
    expect(normalizeShareBaseUrl("calendario.albotero.com")).toBeNull()
    expect(normalizeShareBaseUrl("javascript:alert(1)")).toBeNull()
  })
})
