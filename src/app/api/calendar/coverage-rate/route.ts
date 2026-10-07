import { z } from "zod"
import {
  DEFAULT_COVERED_SHIFT_RATE_COP,
  getCoveredShiftRateForDate,
  normalizeCoveredShiftRates,
} from "@/lib/calendar/coverage-compensation"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const COVERAGE_RATE_KEY = "calendar.coveredShiftRateCop"
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rateSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
  effectiveFrom: dateKeySchema.optional(),
  previousEffectiveFrom: dateKeySchema.optional(),
})
const deleteRateSchema = z.object({ effectiveFrom: dateKeySchema })

function todayInColombia() {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  )
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`
}

function nextCalendarDate(date: string) {
  const next = new Date(`${date}T12:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

function isValidDateKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function rateResponse(rates: ReturnType<typeof normalizeCoveredShiftRates>, today: string) {
  const latest = rates.at(-1) ?? { effectiveFrom: "1900-01-01", amount: DEFAULT_COVERED_SHIFT_RATE_COP }
  return {
    amount: getCoveredShiftRateForDate(rates, today),
    configuredAmount: latest.amount,
    effectiveFrom: latest.effectiveFrom,
    minimumEffectiveFrom: nextCalendarDate(today),
    rates,
  }
}

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: COVERAGE_RATE_KEY },
      select: { value: true },
    })
    const rates = normalizeCoveredShiftRates(setting?.value)
    return Response.json(rateResponse(rates, todayInColombia()))
  } catch {
    return Response.json({ error: "No se pudo consultar la tarifa por jornada" }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = rateSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "La tarifa debe ser un valor entero en COP" }, { status: 400 })

  try {
    const today = todayInColombia()
    const minimumEffectiveFrom = nextCalendarDate(today)
    const effectiveFrom = parsed.data.effectiveFrom ?? minimumEffectiveFrom
    if (!isValidDateKey(effectiveFrom) || effectiveFrom < "1900-01-01") {
      return Response.json({ error: "Fecha de entrada en vigor inválida" }, { status: 400 })
    }

    const currentSetting = await prisma.appSetting.findUnique({
      where: { key: COVERAGE_RATE_KEY },
      select: { value: true },
    })
    const rates = normalizeCoveredShiftRates(currentSetting?.value)
    let nextRates = rates
    if (parsed.data.previousEffectiveFrom) {
      const existing = rates.find((rate) => rate.effectiveFrom === parsed.data.previousEffectiveFrom)
      if (!existing) return Response.json({ error: "No se encontró la tarifa del historial" }, { status: 404 })
      if (existing.effectiveFrom === rates[0]?.effectiveFrom && effectiveFrom !== existing.effectiveFrom) {
        return Response.json({ error: "La fecha de la tarifa base no se puede cambiar" }, { status: 400 })
      }
      nextRates = rates.filter((rate) => rate.effectiveFrom !== parsed.data.previousEffectiveFrom)
    }
    if (nextRates.some((rate) => rate.effectiveFrom === effectiveFrom)) {
      return Response.json({ error: "Ya existe una tarifa con esa fecha de inicio" }, { status: 409 })
    }
    nextRates = [...nextRates, { effectiveFrom, amount: parsed.data.amount }].sort((left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom),
    )
    await prisma.appSetting.upsert({
      where: { key: COVERAGE_RATE_KEY },
      create: { key: COVERAGE_RATE_KEY, value: nextRates },
      update: { value: nextRates },
    })
    return Response.json({ ...rateResponse(nextRates, todayInColombia()), effectiveFrom })
  } catch {
    return Response.json({ error: "No se pudo guardar la tarifa por jornada" }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = deleteRateSchema.safeParse(body)
  if (!parsed.success || !isValidDateKey(parsed.data.effectiveFrom)) {
    return Response.json({ error: "Fecha de tarifa inválida" }, { status: 400 })
  }

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: COVERAGE_RATE_KEY },
      select: { value: true },
    })
    const rates = normalizeCoveredShiftRates(setting?.value)
    if (rates[0]?.effectiveFrom === parsed.data.effectiveFrom) {
      return Response.json({ error: "La tarifa base no se puede borrar" }, { status: 400 })
    }
    if (!rates.some((rate) => rate.effectiveFrom === parsed.data.effectiveFrom)) {
      return Response.json({ error: "No se encontró la tarifa del historial" }, { status: 404 })
    }

    const nextRates = rates.filter((rate) => rate.effectiveFrom !== parsed.data.effectiveFrom)
    await prisma.appSetting.upsert({
      where: { key: COVERAGE_RATE_KEY },
      create: { key: COVERAGE_RATE_KEY, value: nextRates },
      update: { value: nextRates },
    })
    return Response.json({
      ...rateResponse(nextRates, todayInColombia()),
      deletedEffectiveFrom: parsed.data.effectiveFrom,
    })
  } catch {
    return Response.json({ error: "No se pudo eliminar la tarifa por jornada" }, { status: 503 })
  }
}
