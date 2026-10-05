import { describe, expect, it } from "vitest"
import { findScheduleConflicts, getDayAvailability } from "@/lib/calendar/availability"
import type { CalendarEntry } from "@/lib/calendar/types"

const reservedShift: CalendarEntry = {
  id: "r4-am",
  date: "2026-10-05",
  kind: "SOMA",
  status: "R4",
  period: "AM",
  title: "R4",
}

describe("calendar availability", () => {
  it("keeps a Soma reservation distinct from free time", () => {
    expect(getDayAvailability([reservedShift], "2026-10-05")).toBe("RESERVA")
    expect(getDayAvailability([], "2026-10-05")).toBe("SIN_REGISTRO")
  })

  it("marks an in-person Soma shift as occupied", () => {
    expect(getDayAvailability([{ ...reservedShift, status: "TURNO" }], "2026-10-05")).toBe("OCUPADO")
  })

  it("detects a timed event overlapping a shift when its window is configured", () => {
    const appointment: CalendarEntry = {
      id: "appointment",
      date: "2026-10-05",
      kind: "PERSONAL",
      title: "Cita médica",
      startTime: "12:00",
      durationHours: 2,
    }
    const conflicts = findScheduleConflicts([{ ...reservedShift, status: "TURNO" }, appointment], {
      AM: { startTime: "07:00", durationMinutes: 360 },
    })

    expect(conflicts).toMatchObject([{ date: "2026-10-05", type: "HORARIO" }])
  })

  it("reports a vacation overlap without adding financial penalties", () => {
    const vacation: CalendarEntry = {
      id: "vacation",
      date: "2026-10-04",
      endDate: "2026-10-06",
      kind: "VACACIONES",
      title: "VACACIONES",
    }

    expect(findScheduleConflicts([vacation, reservedShift])).toMatchObject([{ date: "2026-10-05", type: "VACACIONES" }])
  })
})
