import { addDays, subDays } from "date-fns"
import { z } from "zod"
import { generateSomaAlternate, generateSomaRotation } from "./soma-rotation"
import type { SomaStatus } from "./types"

export const somaAnnualPlanSchema = z
  .object({
    year: z.number().int().min(1900).max(9998),
    mainStartDate: z.iso.date(),
    mainEndDate: z.iso.date(),
    anchorDate: z.iso.date(),
    anchorStatus: z.enum(["LIBRE", "R4", "R3", "R2", "R1", "TURNO"]),
    yearEndMode: z.enum(["UNPLANNED", "ALTERNATE"]),
  })
  .superRefine((plan, context) => {
    if (plan.mainStartDate > plan.mainEndDate) {
      context.addIssue({
        code: "custom",
        message: "La secuencia principal debe terminar después de iniciar",
        path: ["mainEndDate"],
      })
    }

    if (plan.mainStartDate.slice(0, 4) !== String(plan.year) || plan.mainEndDate.slice(0, 4) !== String(plan.year)) {
      context.addIssue({
        code: "custom",
        message: "Las fechas de la secuencia principal deben pertenecer al año seleccionado",
        path: ["year"],
      })
    }

    if (plan.anchorDate.slice(0, 4) !== String(plan.year)) {
      context.addIssue({
        code: "custom",
        message: "La fecha ancla debe pertenecer al año seleccionado",
        path: ["anchorDate"],
      })
    }
  })

export type SomaAnnualPlan = z.infer<typeof somaAnnualPlanSchema>
export type SomaAutomaticStatus = Extract<SomaStatus, "LIBRE" | "R4" | "R3" | "R2" | "R1" | "TURNO">

export type SomaYearEndWindow = {
  mode: SomaAnnualPlan["yearEndMode"]
  startDate: string
  endDate: string | null
}

export function getSomaYearEndWindow(plan: SomaAnnualPlan, nextPlan?: SomaAnnualPlan): SomaYearEndWindow {
  const startDate = addDays(new Date(`${plan.mainEndDate}T12:00:00.000Z`), 1)
    .toISOString()
    .slice(0, 10)
  const endDate = nextPlan
    ? subDays(new Date(`${nextPlan.mainStartDate}T12:00:00.000Z`), 1)
        .toISOString()
        .slice(0, 10)
    : null

  if (endDate !== null && endDate < startDate) {
    throw new RangeError("La secuencia del siguiente año debe iniciar después del bloque de fin de año")
  }

  return { mode: plan.yearEndMode, startDate, endDate }
}

export function getSomaAnnualPlanKey(year: number) {
  return `soma.annualPlan.${year}`
}

export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function isSomaStatus(value: string): value is SomaStatus {
  return ["LIBRE", "R4", "R3", "R2", "R1", "TURNO"].includes(value)
}

export function getSomaAutomaticStatus(
  date: string,
  plans: ReadonlyMap<number, SomaAnnualPlan>,
): SomaAutomaticStatus | undefined {
  const year = Number(date.slice(0, 4))
  const currentPlan = plans.get(year)

  if (currentPlan && date >= currentPlan.mainStartDate && date <= currentPlan.mainEndDate) {
    const status = generateSomaRotation(
      currentPlan.mainStartDate,
      currentPlan.mainEndDate,
      currentPlan.anchorDate,
      currentPlan.anchorStatus,
    ).find((day) => day.date === date)?.status
    return status && ["LIBRE", "R4", "R3", "R2", "R1", "TURNO"].includes(status)
      ? (status as SomaAutomaticStatus)
      : undefined
  }

  const previousPlan = plans.get(year - 1)
  if (previousPlan?.yearEndMode === "ALTERNATE" && currentPlan) {
    const window = getSomaYearEndWindow(previousPlan, currentPlan)
    if (window.endDate && date >= window.startDate && date <= window.endDate) {
      const status = generateSomaAlternate(window.startDate, window.endDate).find((day) => day.date === date)?.status
      return status && ["LIBRE", "R4", "R3", "R2", "R1", "TURNO"].includes(status)
        ? (status as SomaAutomaticStatus)
        : undefined
    }
  }

  return undefined
}
export function getSomaAutomaticNightDates(plans: ReadonlyMap<number, SomaAnnualPlan>) {
  const nightDates = new Set<string>()

  function addTurnDates(days: ReturnType<typeof generateSomaRotation>) {
    days.filter((day) => day.status === "TURNO").forEach((day) => nightDates.add(day.date))
  }

  for (const plan of plans.values()) {
    addTurnDates(generateSomaRotation(plan.mainStartDate, plan.mainEndDate, plan.anchorDate, plan.anchorStatus))

    const nextPlan = plans.get(plan.year + 1)
    if (plan.yearEndMode === "ALTERNATE" && nextPlan) {
      const window = getSomaYearEndWindow(plan, nextPlan)
      if (window.endDate) addTurnDates(generateSomaAlternate(window.startDate, window.endDate))
    }
  }

  return [...nightDates].sort()
}
