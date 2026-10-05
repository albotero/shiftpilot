import { createCalendarEntrySchema } from "@/lib/calendar/create-schema"
import type { CalendarEntry } from "@/lib/calendar/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function mapShift(shift: { id: string; date: Date; status: string; period: "AM" | "PM" }): CalendarEntry {
  return {
    id: shift.id,
    date: dateKey(shift.date),
    kind: "SOMA",
    status: shift.status as CalendarEntry["status"],
    period: shift.period,
    title: shift.status,
  }
}

export async function GET() {
  try {
    const [shifts, events, vacations] = await Promise.all([
      prisma.shift.findMany({ orderBy: [{ date: "asc" }, { period: "asc" }] }),
      prisma.event.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
      prisma.vacation.findMany({ orderBy: { startDate: "asc" } }),
    ])

    const entries: CalendarEntry[] = [
      ...shifts.map(mapShift),
      ...events.map((event) => ({
        id: event.id,
        date: dateKey(event.date),
        kind: event.category,
        title: event.title,
        ...(event.startTime ? { startTime: event.startTime } : {}),
        ...(event.durationMinutes ? { durationHours: event.durationMinutes / 60 } : {}),
        ...(event.location ? { location: event.location } : {}),
        ...(event.notes ? { notes: event.notes } : {}),
      })),
      ...vacations.map((vacation) => ({
        id: vacation.id,
        date: dateKey(vacation.startDate),
        endDate: dateKey(vacation.endDate),
        kind: "VACACIONES" as const,
        title: "VACACIONES",
        ...(vacation.notes ? { notes: vacation.notes } : {}),
      })),
    ]

    return Response.json(entries)
  } catch {
    return Response.json({ error: "Base de datos local no disponible" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = createCalendarEntrySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Registro de calendario inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  const entry = parsed.data
  try {
    if (entry.kind === "SOMA") {
      const work = await prisma.work.findUnique({ where: { name: "Soma" } })
      if (!work || !entry.status || !entry.period) {
        return Response.json({ error: "Falta la configuración inicial de Soma" }, { status: 409 })
      }
      const periods = entry.period === "AM + PM" ? (["AM", "PM"] as const) : [entry.period]
      const shifts = await prisma.$transaction(
        periods.map((period) =>
          prisma.shift.create({
            data: {
              workId: work.id,
              date: new Date(`${entry.date}T00:00:00.000Z`),
              period,
              status: entry.status as "LIBRE" | "R4" | "R3" | "R2" | "R1" | "TURNO",
              durationHours: 6,
            },
          }),
        ),
      )
      return Response.json(shifts.map(mapShift), { status: 201 })
    }

    if (entry.kind === "VACACIONES") {
      const vacation = await prisma.vacation.create({
        data: {
          startDate: new Date(`${entry.date}T00:00:00.000Z`),
          endDate: new Date(`${entry.endDate ?? entry.date}T00:00:00.000Z`),
          notes: entry.notes,
        },
      })
      return Response.json(
        [
          {
            id: vacation.id,
            date: dateKey(vacation.startDate),
            endDate: dateKey(vacation.endDate),
            kind: "VACACIONES",
            title: "VACACIONES",
            ...(vacation.notes ? { notes: vacation.notes } : {}),
          },
        ],
        { status: 201 },
      )
    }

    const workName = entry.kind === "SEDARTE" ? "Sedarte" : undefined
    const work = workName ? await prisma.work.findUnique({ where: { name: workName } }) : null
    if (workName && !work) {
      return Response.json({ error: "Falta la configuración inicial de Sedarte" }, { status: 409 })
    }

    const event = await prisma.event.create({
      data: {
        workId: work?.id,
        category: entry.kind,
        title: entry.title,
        date: new Date(`${entry.date}T00:00:00.000Z`),
        startTime: entry.startTime,
        durationMinutes: entry.durationHours ? Math.round(entry.durationHours * 60) : null,
        location: entry.location,
        notes: entry.notes,
      },
    })

    return Response.json(
      [
        {
          id: event.id,
          date: dateKey(event.date),
          kind: event.category,
          title: event.title,
          ...(event.startTime ? { startTime: event.startTime } : {}),
          ...(event.durationMinutes ? { durationHours: event.durationMinutes / 60 } : {}),
          ...(event.location ? { location: event.location } : {}),
          ...(event.notes ? { notes: event.notes } : {}),
        },
      ],
      { status: 201 },
    )
  } catch (error) {
    const isUniqueConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
    return Response.json(
      { error: isUniqueConflict ? "Ya existe un registro para esa jornada" : "No se pudo guardar el registro" },
      { status: isUniqueConflict ? 409 : 503 },
    )
  }
}
