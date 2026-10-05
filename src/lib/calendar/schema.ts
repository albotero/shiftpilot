import { z } from "zod"

export const calendarEntrySchema = z.object({
  id: z.string().min(1),
  date: z.iso.date(),
  endDate: z.iso.date().optional(),
  kind: z.enum(["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"]),
  status: z
    .enum([
      "LIBRE",
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
  manualOverride: z.boolean().optional(),
  restoreAutomatic: z.boolean().optional(),
  annualPlanYear: z.number().int().optional(),
  replacementPersonId: z.string().min(1).optional(),
  anesthesiologist: z.string().max(100).optional(),
  amReplacementPersonId: z.string().min(1).optional(),
  pmReplacementPersonId: z.string().min(1).optional(),
  period: z.enum(["AM", "PM", "AM + PM", "NOCHE"]).optional(),
  title: z.string().max(80),
  startTime: z.string().optional(),
  durationHours: z.number().positive().max(24).optional(),
  location: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
})

export const calendarEntriesSchema = z.array(calendarEntrySchema)
