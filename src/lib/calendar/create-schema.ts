import { z } from "zod"
import { isCompleteVacationRange } from "./vacation-weeks"

export const createCalendarEntrySchema = z
  .object({
    id: z.string().min(1),
    date: z.iso.date(),
    endDate: z.iso.date().optional(),
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
