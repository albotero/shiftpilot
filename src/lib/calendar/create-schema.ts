import { z } from "zod"
import { isCompleteVacationRange } from "./vacation-weeks"

export const createCalendarEntrySchema = z
  .object({
    id: z.string().min(1),
    date: z.iso.date(),
    endDate: z.iso.date().optional(),
    recurrenceId: z.string().min(1).optional(),
    repeatWeekly: z.boolean().optional(),
    recurrenceStartDate: z.iso.date().optional(),
    recurrenceEndDate: z.union([z.iso.date(), z.null()]).optional(),
    recurrenceWeekday: z.number().int().min(0).max(6).optional(),
    recurrenceFrequency: z.enum(["WEEKLY", "MONTHLY", "INTERVAL"]).optional(),
    recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
    recurrenceDayOfMonth: z.number().int().min(1).max(31).optional(),
    recurrenceLastDayOfMonth: z.boolean().optional(),
    recurrenceIntervalDays: z.number().int().min(1).max(3650).optional(),
    recurrencePeriod: z.enum(["AM", "PM", "AM_PM", "NOCHE"]).optional(),
    skipHolidays: z.boolean().optional(),
    kind: z.enum(["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"]),
    status: z
      .enum([
        "R4",
        "R3",
        "R2",
        "R1",
        "R5",
        "TURNO",
        "NOCHE",
        "TURNO_OTRA_PERSONA",
        "TURNO_DE_OTRA_PERSONA",
        "EXTERNO",
        "EXTERNO_NOCHE",
      ])
      .optional(),
    restoreAutomatic: z.boolean().optional(),
    anesthesiologist: z.string().trim().max(100).optional(),
    replacementPersonId: z.string().min(1).optional(),
    amReplacementPersonId: z.string().min(1).optional(),
    pmReplacementPersonId: z.string().min(1).optional(),
    period: z.enum(["AM", "PM", "AM + PM", "NOCHE"]).optional(),
    title: z.string().trim().max(80),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    durationHours: z.number().positive().max(24).optional(),
    location: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((entry, context) => {
    const recurrenceStartDate = entry.recurrenceStartDate ?? entry.date
    if (entry.recurrenceId && !entry.repeatWeekly) {
      context.addIssue({
        code: "custom",
        message: "Una ocurrencia recurrente debe conservar su serie",
        path: ["repeatWeekly"],
      })
    }
    if (entry.repeatWeekly) {
      if (entry.kind !== "SOMA" && entry.kind !== "PERSONAL") {
        context.addIssue({
          code: "custom",
          message: "Sólo los turnos Soma y eventos personales se pueden repetir",
          path: ["repeatWeekly"],
        })
      }
      const recurrenceFrequency = entry.recurrenceFrequency ?? "WEEKLY"
      const recurrenceWeekdays = entry.recurrenceWeekdays?.length
        ? entry.recurrenceWeekdays
        : entry.recurrenceWeekday === undefined
          ? []
          : [entry.recurrenceWeekday]
      if (recurrenceFrequency === "WEEKLY" && recurrenceWeekdays.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Selecciona al menos un día semanal",
          path: ["recurrenceWeekdays"],
        })
      }
      if (recurrenceFrequency === "MONTHLY" && !entry.recurrenceLastDayOfMonth && !entry.recurrenceDayOfMonth) {
        context.addIssue({ code: "custom", message: "Selecciona el día del mes", path: ["recurrenceDayOfMonth"] })
      }
      if (recurrenceFrequency === "INTERVAL" && !entry.recurrenceIntervalDays) {
        context.addIssue({
          code: "custom",
          message: "Indica cada cuántos días repetir",
          path: ["recurrenceIntervalDays"],
        })
      }
      if (entry.recurrenceEndDate && entry.recurrenceEndDate < recurrenceStartDate) {
        context.addIssue({
          code: "custom",
          message: "La fecha final debe ser igual o posterior al inicio",
          path: ["recurrenceEndDate"],
        })
      }
      if (entry.kind === "SOMA" && !entry.recurrencePeriod) {
        context.addIssue({
          code: "custom",
          message: "Selecciona la jornada que se repetirá",
          path: ["recurrencePeriod"],
        })
      }
      if (
        entry.kind === "SOMA" &&
        (entry.status === "TURNO_OTRA_PERSONA" || entry.status === "TURNO_DE_OTRA_PERSONA")
      ) {
        context.addIssue({ code: "custom", message: "Los turnos cubiertos no se pueden repetir", path: ["status"] })
      }
    }
    if (entry.restoreAutomatic && entry.kind !== "SOMA") {
      context.addIssue({
        code: "custom",
        message: "Automatic rotation applies only to Soma",
        path: ["restoreAutomatic"],
      })
    }
    if (entry.restoreAutomatic && entry.status !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Automatic rotation cannot include a manual status",
        path: ["status"],
      })
    }
    if (entry.kind !== "SOMA" && entry.period !== undefined) {
      context.addIssue({ code: "custom", message: "Las jornadas AM/PM sólo aplican a Soma", path: ["period"] })
    }
    if (entry.kind === "SOMA" && ((!entry.status && !entry.restoreAutomatic) || !entry.period)) {
      context.addIssue({ code: "custom", message: "Soma requires a status and period", path: ["status"] })
    }
    if (entry.kind === "SEDARTE" && (!entry.startTime || !entry.durationHours)) {
      context.addIssue({
        code: "custom",
        message: "Timed events require a start time and duration",
        path: ["startTime"],
      })
    }
    if (entry.kind === "SEDARTE" && !entry.title) {
      context.addIssue({ code: "custom", message: "Sedarte events require a title", path: ["title"] })
    }
    if (entry.kind === "PERSONAL" && Boolean(entry.startTime) !== Boolean(entry.durationHours)) {
      context.addIssue({
        code: "custom",
        message: "Personal events need both time and duration, or neither",
        path: ["startTime"],
      })
    }
    if (entry.kind === "VACACIONES" && (!entry.endDate || !isCompleteVacationRange(entry.date, entry.endDate))) {
      context.addIssue({
        code: "custom",
        message: "Vacaciones debe cubrir una o más semanas completas de siete días",
        path: ["endDate"],
      })
    }
  })

export const deleteCalendarEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"]),
})
