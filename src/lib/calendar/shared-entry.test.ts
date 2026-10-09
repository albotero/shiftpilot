import { describe, expect, it } from "vitest"
import { SHARED_SEDATION_TITLE, toSharedCalendarEntry } from "@/lib/calendar/shared-entry"
import type { CalendarEntry } from "@/lib/calendar/types"

describe("toSharedCalendarEntry", () => {
  it("replaces sedation titles and keeps only time and duration", () => {
    const sedation: CalendarEntry = {
      id: "sedation",
      date: "2026-10-09",
      kind: "SEDARTE",
      title: "Paciente Pérez - colonoscopia",
      startTime: "07:30",
      durationHours: 1.5,
      location: "Clínica Norte",
      notes: "Ayuno 8 h",
    }

    expect(toSharedCalendarEntry(sedation)).toEqual({
      id: "sedation",
      date: "2026-10-09",
      kind: "SEDARTE",
      title: SHARED_SEDATION_TITLE,
      startTime: "07:30",
      durationHours: 1.5,
    })
  })

  it("removes notes and locations from every other entry kind", () => {
    const personal: CalendarEntry = {
      id: "personal",
      date: "2026-10-09",
      kind: "PERSONAL",
      title: "Cita",
      location: "Casa",
      notes: "Privado",
    }
    const shift: CalendarEntry = {
      id: "shift",
      date: "2026-10-09",
      kind: "SOMA",
      status: "TURNO",
      period: "AM",
      title: "TURNO",
      notes: "Nota de turno",
    }

    const sharedPersonal = toSharedCalendarEntry(personal)
    expect(sharedPersonal).toEqual({ id: "personal", date: "2026-10-09", kind: "PERSONAL", title: "Cita" })
    expect(toSharedCalendarEntry(shift)).not.toHaveProperty("notes")
  })
})
