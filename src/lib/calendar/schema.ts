import { z } from "zod";

export const calendarEntrySchema = z.object({
  id: z.string().min(1),
  date: z.iso.date(),
  endDate: z.iso.date().optional(),
  kind: z.enum(["SOMA", "SEDARTE", "PERSONAL", "VACACIONES"]),
  status: z.enum(["LIBRE", "R4", "R3", "R2", "R1", "TURNO"]).optional(),
  period: z.enum(["AM", "PM", "AM + PM"]).optional(),
  title: z.string().max(80),
  startTime: z.string().optional(),
  durationHours: z.number().positive().max(24).optional(),
  location: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const calendarEntriesSchema = z.array(calendarEntrySchema);