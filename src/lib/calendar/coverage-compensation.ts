import { isSameMonth } from "date-fns"
import { addMoney } from "@/lib/money/integer"
import type { CalendarEntry } from "./types"

export const DEFAULT_COVERED_SHIFT_RATE_THOUSANDS = 685
export const DEFAULT_COVERED_SHIFT_RATE_HISTORY = [
  { effectiveFrom: "1900-01-01", amountThousands: DEFAULT_COVERED_SHIFT_RATE_THOUSANDS },
] as const

export type CoveredShiftRate = { effectiveFrom: string; amountThousands: number }

export type CoveredShiftRow = {
  anesthesiologist: string
  jornadas: number
  totalAmountThousands: number
}

export type CoveredShiftSummary = {
  rows: CoveredShiftRow[]
  totalJornadas: number
  totalAmountThousands: number
}

export function normalizeCoveredShiftRates(value: unknown): CoveredShiftRate[] {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return [{ effectiveFrom: "1900-01-01", amountThousands: value }]
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
        "amountThousands" in item &&
        typeof item.amountThousands === "number" &&
        Number.isFinite(item.amountThousands) &&
        item.amountThousands >= 0,
    )
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))

  return rates.length > 0 ? rates : [...DEFAULT_COVERED_SHIFT_RATE_HISTORY]
}

export function getCoveredShiftRateForDate(rates: CoveredShiftRate[], date: string) {
  return rates.reduce(
    (currentRate, rate) => (rate.effectiveFrom <= date ? rate.amountThousands : currentRate),
    DEFAULT_COVERED_SHIFT_RATE_THOUSANDS,
  )
}

export function getCoveredShiftSummary(
  entries: CalendarEntry[],
  month: Date,
  rates: CoveredShiftRate[],
): CoveredShiftSummary {
  const totalsByAnesthesiologist = new Map<string, { jornadas: number; totalAmountThousands: number }>()

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
    const total = totalsByAnesthesiologist.get(anesthesiologist) ?? { jornadas: 0, totalAmountThousands: 0 }
    total.jornadas += jornadas
    total.totalAmountThousands = addMoney(
      total.totalAmountThousands,
      jornadas * getCoveredShiftRateForDate(rates, entry.date),
    )
    totalsByAnesthesiologist.set(anesthesiologist, total)
  }

  const rows = [...totalsByAnesthesiologist]
    .map(([anesthesiologist, total]) => ({ anesthesiologist, ...total }))
    .sort(
      (left, right) =>
        right.jornadas - left.jornadas || left.anesthesiologist.localeCompare(right.anesthesiologist, "es"),
    )
  const totalJornadas = rows.reduce((total, row) => total + row.jornadas, 0)
  const totalAmountThousands = addMoney(...rows.map((row) => row.totalAmountThousands))

  return { rows, totalJornadas, totalAmountThousands }
}
