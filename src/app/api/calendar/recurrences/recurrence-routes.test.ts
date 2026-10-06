import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  calendarRecurrence: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  calendarRecurrenceException: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
  work: { findUnique: vi.fn(), findMany: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { DELETE, GET, PATCH, POST } from "./route"

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/calendar/recurrences", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.work.findUnique.mockResolvedValue({ id: "soma-work", name: "Soma" })
  prismaMock.calendarRecurrence.findMany.mockResolvedValue([])
  prismaMock.calendarRecurrence.findUnique.mockResolvedValue({
    id: "recurrence-1",
    startDate: new Date("2026-10-03T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
  })
  prismaMock.calendarRecurrenceException.findMany.mockResolvedValue([])
  prismaMock.calendarRecurrenceException.upsert.mockResolvedValue({ id: "exception-1" })
  prismaMock.calendarRecurrenceException.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.$transaction.mockImplementation(async (callback: (transaction: typeof prismaMock) => Promise<unknown>) =>
    callback(prismaMock),
  )
  prismaMock.calendarRecurrence.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "recurrence-1",
    ...data,
  }))
  prismaMock.calendarRecurrence.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      ...data,
    }),
  )
  prismaMock.calendarRecurrence.delete.mockResolvedValue({ id: "recurrence-1" })
})

describe("weekly calendar recurrence routes", () => {
  it("expands a weekly rule only within the requested range", async () => {
    prismaMock.calendarRecurrence.findMany.mockResolvedValue([
      {
        id: "recurrence-1",
        kind: "PERSONAL",
        frequency: "WEEKLY",
        startDate: new Date("2026-10-03T00:00:00.000Z"),
        endDate: new Date("2026-10-17T00:00:00.000Z"),
        weekday: 6,
        weekdays: [6],
        dayOfMonth: null,
        lastDayOfMonth: false,
        intervalDays: null,
        skipHolidays: false,
        title: "Cita personal",
        status: null,
        period: null,
        startTime: null,
        durationMinutes: null,
        location: null,
        notes: null,
      },
    ])

    const response = await GET(new Request("http://localhost/api/calendar/recurrences?from=2026-10-01&to=2026-10-31"))

    expect(response.status).toBe(200)
    const entries = await response.json()
    expect(entries.map((entry: { date: string }) => entry.date)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17"])
    expect(prismaMock.calendarRecurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startDate: { lte: new Date("2026-10-31T00:00:00.000Z") },
          OR: [{ endDate: null }, { endDate: { gte: new Date("2026-10-01T00:00:00.000Z") } }],
        },
      }),
    )
  })

  it("stores a personal weekly series with optional holiday exclusion", async () => {
    const response = await POST(
      jsonRequest("POST", {
        id: "draft-id",
        kind: "PERSONAL",
        date: "2026-10-03",
        repeatWeekly: true,
        recurrenceWeekday: 6,
        recurrenceEndDate: null,
        skipHolidays: true,
        title: "Cita personal",
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: "recurrence-1" })
    expect(prismaMock.calendarRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "PERSONAL",
        frequency: "WEEKLY",
        startDate: new Date("2026-10-03T00:00:00.000Z"),
        endDate: null,
        weekday: 6,
        weekdays: [6],
        skipHolidays: true,
        title: "Cita personal",
      }),
    })
  })

  it("stores monthly last-day recurrence configuration", async () => {
    const response = await POST(
      jsonRequest("POST", {
        kind: "PERSONAL",
        date: "2026-10-06",
        repeatWeekly: true,
        recurrenceFrequency: "MONTHLY",
        recurrenceLastDayOfMonth: true,
        recurrenceEndDate: null,
        title: "Cita mensual",
      }),
    )

    expect(response.status).toBe(201)
    expect(prismaMock.calendarRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        frequency: "MONTHLY",
        weekdays: [],
        dayOfMonth: null,
        lastDayOfMonth: true,
        intervalDays: null,
      }),
    })
  })

  it("rejects a weekly rule without at least one selected weekday", async () => {
    const response = await POST(
      jsonRequest("POST", {
        kind: "PERSONAL",
        date: "2026-10-06",
        repeatWeekly: true,
        recurrenceFrequency: "WEEKLY",
        recurrenceWeekdays: [],
        title: "Cita semanal",
      }),
    )

    expect(response.status).toBe(400)
    expect(prismaMock.calendarRecurrence.create).not.toHaveBeenCalled()
  })

  it("updates the whole series from its first date and can delete all history", async () => {
    const update = await PATCH(
      jsonRequest("PATCH", {
        id: "occurrence-id",
        recurrenceId: "recurrence-1",
        kind: "PERSONAL",
        date: "2026-10-03",
        repeatWeekly: true,
        recurrenceWeekday: 6,
        recurrenceEndDate: "2026-12-31",
        skipHolidays: false,
        title: "Actualizada",
      }),
    )
    const deleted = await DELETE(jsonRequest("DELETE", { id: "recurrence-1" }))

    expect(update.status).toBe(200)
    expect(deleted.status).toBe(200)
    expect(prismaMock.calendarRecurrence.update).toHaveBeenCalledWith({
      where: { id: "recurrence-1" },
      data: expect.objectContaining({ title: "Actualizada", weekday: 6 }),
    })
    expect(prismaMock.calendarRecurrence.delete).toHaveBeenCalledWith({ where: { id: "recurrence-1" } })
  })

  it("updates only one occurrence by storing an exception", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", {
        recurrenceId: "recurrence-1",
        recurrenceEditScope: "OCCURRENCE",
        date: "2026-10-10",
        kind: "PERSONAL",
        repeatWeekly: true,
        recurrenceWeekdays: [6],
        title: "Cita distinta",
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.calendarRecurrenceException.upsert).toHaveBeenCalledWith({
      where: { recurrenceId_date: { recurrenceId: "recurrence-1", date: new Date("2026-10-10T00:00:00.000Z") } },
      create: expect.objectContaining({ recurrenceId: "recurrence-1", date: new Date("2026-10-10T00:00:00.000Z") }),
      update: expect.objectContaining({ title: "Cita distinta" }),
    })
    expect(prismaMock.calendarRecurrence.update).not.toHaveBeenCalled()
  })

  it("splits an edit at the chosen date and preserves the earlier series", async () => {
    prismaMock.calendarRecurrence.findUnique.mockResolvedValue({
      id: "recurrence-1",
      startDate: new Date("2026-10-03T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    })
    prismaMock.calendarRecurrence.create.mockResolvedValue({ id: "recurrence-2" })

    const response = await PATCH(
      jsonRequest("PATCH", {
        recurrenceId: "recurrence-1",
        recurrenceEditScope: "THIS_AND_FUTURE",
        date: "2026-10-10",
        kind: "PERSONAL",
        repeatWeekly: true,
        recurrenceFrequency: "WEEKLY",
        recurrenceWeekdays: [6],
        title: "Cita futura modificada",
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.calendarRecurrence.update).toHaveBeenCalledWith({
      where: { id: "recurrence-1" },
      data: { endDate: new Date("2026-10-09T00:00:00.000Z") },
    })
    expect(prismaMock.calendarRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: new Date("2026-10-10T00:00:00.000Z"),
        title: "Cita futura modificada",
      }),
    })
  })

  it("deletes only the selected date and future dates when requested", async () => {
    prismaMock.calendarRecurrence.findUnique.mockResolvedValue({
      id: "recurrence-1",
      startDate: new Date("2026-10-03T00:00:00.000Z"),
      endDate: null,
    })

    const response = await DELETE(jsonRequest("DELETE", { id: "recurrence-1", scope: "FUTURE", date: "2026-10-10" }))

    expect(response.status).toBe(200)
    expect(prismaMock.calendarRecurrence.update).toHaveBeenCalledWith({
      where: { id: "recurrence-1" },
      data: { endDate: new Date("2026-10-09T00:00:00.000Z") },
    })
    expect(prismaMock.calendarRecurrence.delete).not.toHaveBeenCalled()
  })

  it("rejects recurrence ranges wider than 400 days", async () => {
    const response = await GET(new Request("http://localhost/api/calendar/recurrences?from=2026-01-01&to=2027-02-06"))

    expect(response.status).toBe(400)
    expect(prismaMock.calendarRecurrence.findMany).not.toHaveBeenCalled()
  })
})
