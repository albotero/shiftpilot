import { isSameMonth } from "date-fns"
import type { CalendarEntry } from "./types"

export const DEFAULT_COVERED_SHIFT_RATE_COP = 685_000
export const DEFAULT_COVERED_SHIFT_RATE_HISTORY = [
  { effectiveFrom: "1900-01-01", amount: DEFAULT_COVERED_SHIFT_RATE_COP },
] as const

export type CoveredShiftRate = { effectiveFrom: string; amount: number }

export type CoveredShiftRow = {
  anesthesiologist: string
  jornadas: number
  totalCop: number
}

export type CoveredShiftSummary = {
  rows: CoveredShiftRow[]
  totalJornadas: number
  totalCop: number
}

export function normalizeCoveredShiftRates(value: unknown): CoveredShiftRate[] {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return [{ effectiveFrom: "1900-01-01", amount: value }]
  }

  if (!Array.isArray(value)) return [...DEFAULT_COVERED_SHIFT_RATE_HISTORY]

  const rates = value
    .filter(
      (item): item is CoveredShiftRate =>
        typeof item === "object" &&
        item !== null &&
        "effectiveFrom" in item &&
        typeof item.effectiveFrom === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom) &&
        "amount" in item &&
        typeof item.amount === "number" &&
        Number.isSafeInteger(item.amount) &&
        item.amount >= 0,
    )
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))

  return rates.length > 0 ? rates : [...DEFAULT_COVERED_SHIFT_RATE_HISTORY]
}

export function getCoveredShiftRateForDate(rates: CoveredShiftRate[], date: string) {
  return rates.reduce(
    (currentRate, rate) => (rate.effectiveFrom <= date ? rate.amount : currentRate),
    DEFAULT_COVERED_SHIFT_RATE_COP,
  )
}

export function getCoveredShiftSummary(
  entries: CalendarEntry[],
  month: Date,
  rates: CoveredShiftRate[],
): CoveredShiftSummary {
  const totalsByAnesthesiologist = new Map<string, { jornadas: number; totalCop: number }>()

  for (const entry of entries) {
    if (
      entry.kind !== "SOMA" ||
      entry.status !== "TURNO_OTRA_PERSONA" ||
      !isSameMonth(new Date(`${entry.date}T12:00:00`), month)
    ) {
      continue
    }

    const anesthesiologist = entry.anesthesiologist?.trim() || "Sin nombre registrado"
    const jornadas = entry.period === "AM + PM" || entry.period === "NOCHE" ? 2 : 1
    const total = totalsByAnesthesiologist.get(anesthesiologist) ?? { jornadas: 0, totalCop: 0 }
    total.jornadas += jornadas
    total.totalCop += jornadas * getCoveredShiftRateForDate(rates, entry.date)
    totalsByAnesthesiologist.set(anesthesiologist, total)
  }

  const rows = [...totalsByAnesthesiologist]
    .map(([anesthesiologist, total]) => ({ anesthesiologist, ...total }))
    .sort(
      (left, right) =>
        right.jornadas - left.jornadas || left.anesthesiologist.localeCompare(right.anesthesiologist, "es"),
    )
  const totalJornadas = rows.reduce((total, row) => total + row.jornadas, 0)
  const totalCop = rows.reduce((total, row) => total + row.totalCop, 0)

  return { rows, totalJornadas, totalCop }
}
