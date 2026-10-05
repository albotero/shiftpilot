import { beforeEach, describe, expect, it, vi } from "vitest"

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    work: { findUnique: vi.fn() },
    shift: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createMany: vi.fn(),
    },
    replacementPerson: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    event: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    vacation: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { DELETE, GET as getCalendar, PATCH, POST } from "./route"
import { DELETE as deletePerson, GET as getPeople, POST as createPerson } from "../replacement-people/route"
import { PUT as saveAnnualPlan } from "../soma/annual-plan/route"

const somaWork = { id: "soma-work", name: "Soma" }
const plan2026 = {
  year: 2026,
  mainStartDate: "2026-10-01",
  mainEndDate: "2026-10-01",
  anchorDate: "2026-10-01",
  anchorStatus: "TURNO",
  yearEndMode: "UNPLANNED",
}
const automaticNight = {
  id: "night-1",
  workId: somaWork.id,
  work: somaWork,
  date: new Date("2026-10-01T00:00:00.000Z"),
  period: "NOCHE",
  status: "NOCHE",
  durationHours: 12,
  manualOverride: false,
  anesthesiologist: null,
  notes: null,
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function configureTransactions() {
  prismaMock.$transaction.mockImplementation(async (operation: unknown) => {
    if (typeof operation === "function") {
      return (operation as (transaction: unknown) => Promise<unknown>)(prismaMock)
    }
    return Promise.all(operation as Promise<unknown>[])
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  configureTransactions()
  prismaMock.work.findUnique.mockResolvedValue(somaWork)
  prismaMock.shift.findMany.mockResolvedValue([])
  prismaMock.appSetting.findMany.mockResolvedValue([])
  prismaMock.appSetting.upsert.mockResolvedValue({})
  prismaMock.shift.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
})

describe("Soma calendar route integration", () => {
  it("preserves an inactive catalog person on their existing covered shift", async () => {
    const inactivePerson = { id: "person-inactive", name: "Ana histórica", active: false }
    const coveredShift = {
      ...automaticNight,
      id: "covered-am",
      period: "AM",
      status: "TURNO_OTRA_PERSONA",
      manualOverride: true,
      anesthesiologist: inactivePerson.name,
      coverages: [{ personId: inactivePerson.id }],
    }
    prismaMock.replacementPerson.findUnique.mockResolvedValue(inactivePerson)
    prismaMock.shift.findUnique.mockResolvedValue({ ...coveredShift, work: somaWork })
    prismaMock.shift.findMany.mockResolvedValue([coveredShift])
    prismaMock.shift.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({
      ...coveredShift,
      ...data,
      id: where.id,
      coverages: [{ person: inactivePerson }],
    }))

    const response = await PATCH(
      new Request("http://localhost/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: coveredShift.id,
          date: "2026-10-01",
          kind: "SOMA",
          status: "TURNO_OTRA_PERSONA",
          period: "AM",
          replacementPersonId: inactivePerson.id,
          title: "Cubierto",
        }),
      }),
    )
    const entries = await response.json()

    expect(response.status).toBe(200)
    expect(entries).toMatchObject([{ replacementPersonId: inactivePerson.id, anesthesiologist: inactivePerson.name }])
  })

  it("assigns different catalog anesthesiologists to AM and PM coverage rows", async () => {
    const people = [
      { id: "person-am", name: "Ana AM", active: true },
      { id: "person-pm", name: "Beto PM", active: true },
    ]
    prismaMock.replacementPerson.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => people.find((person) => person.id === where.id) ?? null,
    )
    prismaMock.shift.create.mockImplementation(
      async ({
        data,
      }: {
        data: {
          period: string
          coverages?: { create?: { person?: { connect?: { id?: string } } } }
        }
      }) => {
        const personId = data.coverages?.create?.person?.connect?.id
        const person = people.find((candidate) => candidate.id === personId)
        return {
          ...automaticNight,
          ...data,
          id: `shift-${data.period}`,
          coverages: person ? [{ person }] : [],
        }
      },
    )

    const response = await POST(
      jsonRequest({
        id: "combined-coverage",
        date: "2026-10-01",
        kind: "SOMA",
        status: "TURNO_OTRA_PERSONA",
        period: "AM + PM",
        amReplacementPersonId: "person-am",
        pmReplacementPersonId: "person-pm",
        title: "Cubierto",
      }),
    )
    const entries = await response.json()

    expect(response.status).toBe(201)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ period: "AM", replacementPersonId: "person-am", anesthesiologist: "Ana AM" }),
        expect.objectContaining({ period: "PM", replacementPersonId: "person-pm", anesthesiologist: "Beto PM" }),
      ]),
    )
    expect(prismaMock.shift.create).toHaveBeenCalledTimes(2)
  })

  it("replaces an automatically generated NOCHE shift with a covered night", async () => {
    prismaMock.shift.findMany.mockResolvedValue([automaticNight])
    prismaMock.shift.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({
      ...automaticNight,
      ...data,
      id: where.id,
    }))

    const response = await POST(
      jsonRequest({
        id: "new-coverage",
        date: "2026-10-01",
        kind: "SOMA",
        status: "TURNO_OTRA_PERSONA",
        period: "NOCHE",
        anesthesiologist: "Verónica",
        notes: "Cambio de turno",
        title: "Cubierto",
      }),
    )
    const entries = await response.json()

    expect(response.status).toBe(201)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: automaticNight.id,
      period: "NOCHE",
      status: "TURNO_OTRA_PERSONA",
      anesthesiologist: "Verónica",
      notes: "Cambio de turno",
    })
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: automaticNight.id },
        data: expect.objectContaining({ durationHours: 12, period: "NOCHE" }),
      }),
    )
    expect(prismaMock.shift.create).not.toHaveBeenCalled()
  })

  it("does not overwrite an existing manual Soma shift", async () => {
    prismaMock.shift.findMany.mockResolvedValue([{ ...automaticNight, manualOverride: true }])

    const response = await POST(
      jsonRequest({
        id: "second-coverage",
        date: "2026-10-01",
        kind: "SOMA",
        status: "TURNO_OTRA_PERSONA",
        period: "NOCHE",
        anesthesiologist: "Patricia",
        title: "Cubierto",
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(409)
    expect(result.error).toMatch(/ajuste manual/)
    expect(prismaMock.shift.update).not.toHaveBeenCalled()
    expect(prismaMock.shift.create).not.toHaveBeenCalled()
  })

  it("restores a covered automatic NOCHE shift to NOCHE and 12 hours", async () => {
    const coveredNight = {
      ...automaticNight,
      status: "TURNO_OTRA_PERSONA",
      manualOverride: true,
      anesthesiologist: "Verónica",
      notes: "Conservar nota",
    }
    prismaMock.shift.findUnique.mockResolvedValue({ ...coveredNight, work: somaWork })
    prismaMock.shift.findMany.mockResolvedValue([coveredNight])
    prismaMock.appSetting.findMany.mockResolvedValue([{ key: "soma.annualPlan.2026", value: plan2026 }])
    prismaMock.shift.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({
      ...coveredNight,
      ...data,
      id: where.id,
    }))

    const response = await DELETE(
      new Request("http://localhost/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: coveredNight.id, kind: "SOMA" }),
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ id: coveredNight.id, status: "NOCHE", period: "NOCHE" })
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: coveredNight.id },
        data: expect.objectContaining({ status: "NOCHE", durationHours: 12, manualOverride: false }),
      }),
    )
  })

  it("restores a manual R5 shift to the planned TURNO status", async () => {
    const manualR5 = {
      ...automaticNight,
      id: "manual-r5-am",
      period: "AM",
      status: "R5",
      manualOverride: true,
    }
    prismaMock.shift.findUnique.mockResolvedValue({ ...manualR5, work: somaWork })
    prismaMock.shift.findMany.mockResolvedValue([manualR5])
    prismaMock.appSetting.findMany.mockResolvedValue([{ key: "soma.annualPlan.2026", value: plan2026 }])
    prismaMock.shift.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: object }) => ({
      ...manualR5,
      ...data,
      id: where.id,
    }))

    const response = await DELETE(
      new Request("http://localhost/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: manualR5.id, kind: "SOMA" }),
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.entries).toMatchObject([{ id: manualR5.id, status: "TURNO", period: "AM" }])
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: manualR5.id },
        data: expect.objectContaining({ status: "TURNO", durationHours: 6, manualOverride: false }),
      }),
    )
  })

  it("removes a manual shift when no automatic rotation is planned", async () => {
    const manualR5 = {
      ...automaticNight,
      id: "manual-r5-unplanned",
      date: new Date("2032-01-13T00:00:00.000Z"),
      period: "AM",
      status: "R5",
      manualOverride: true,
    }
    prismaMock.shift.findUnique.mockResolvedValue({ ...manualR5, work: somaWork })
    prismaMock.shift.findMany.mockResolvedValue([manualR5])
    prismaMock.appSetting.findMany.mockResolvedValue([])

    const response = await DELETE(
      new Request("http://localhost/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: manualR5.id, kind: "SOMA" }),
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ restored: true, entries: [], removedIds: [manualR5.id] })
    expect(prismaMock.shift.delete).toHaveBeenCalledWith({ where: { id: manualR5.id } })
  })

  it("generates a 12-hour NOCHE row for each TURNO day in an annual plan", async () => {
    prismaMock.work.findUnique.mockResolvedValue(somaWork)

    const response = await saveAnnualPlan(
      new Request("http://localhost/api/soma/annual-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan2026),
      }),
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.insertedMainShifts).toBe(3)
    expect(prismaMock.shift.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          date: new Date("2026-10-01T00:00:00.000Z"),
          period: "NOCHE",
          status: "NOCHE",
          durationHours: 12,
          workId: somaWork.id,
        }),
      ]),
      skipDuplicates: true,
    })
  })
})

describe("Vacation calendar routes", () => {
  const vacation = {
    id: "vacation-1",
    startDate: new Date("2026-10-07T00:00:00.000Z"),
    endDate: new Date("2026-10-20T00:00:00.000Z"),
    annualPlanYear: null,
    notes: "Descanso",
  }

  it("creates a complete vacation range and returns both dates", async () => {
    prismaMock.shift.findMany.mockResolvedValue([])
    prismaMock.event.findMany.mockResolvedValue([])
    prismaMock.vacation.findMany.mockResolvedValue([])
    prismaMock.vacation.create.mockResolvedValue(vacation)

    const response = await POST(
      jsonRequest({
        id: "vacation-1",
        date: "2026-10-07",
        endDate: "2026-10-20",
        kind: "VACACIONES",
        title: "VACACIONES",
        notes: "Descanso",
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual([
      {
        id: vacation.id,
        date: "2026-10-07",
        endDate: "2026-10-20",
        kind: "VACACIONES",
        title: "VACACIONES",
        notes: "Descanso",
      },
    ])
    expect(prismaMock.vacation.create).toHaveBeenCalledWith({
      data: {
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        notes: "Descanso",
      },
    })
  })

  it("rejects a partial-week vacation before writing it", async () => {
    const response = await POST(
      jsonRequest({
        id: "partial-vacation",
        date: "2026-10-07",
        endDate: "2026-10-12",
        kind: "VACACIONES",
        title: "VACACIONES",
      }),
    )

    expect(response.status).toBe(400)
    expect(prismaMock.vacation.create).not.toHaveBeenCalled()
  })

  it("returns a vacation period with its end date from calendar GET", async () => {
    prismaMock.shift.findMany.mockResolvedValue([])
    prismaMock.event.findMany.mockResolvedValue([])
    prismaMock.vacation.findMany.mockResolvedValue([vacation])

    const response = await getCalendar()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: vacation.id,
        date: "2026-10-07",
        endDate: "2026-10-20",
        kind: "VACACIONES",
        title: "VACACIONES",
        notes: "Descanso",
      },
    ])
  })

  it("updates a manual vacation range and its notes", async () => {
    prismaMock.vacation.findUnique.mockResolvedValue(vacation)
    prismaMock.vacation.update.mockResolvedValue({
      ...vacation,
      startDate: new Date("2026-10-14T00:00:00.000Z"),
      endDate: new Date("2026-10-27T00:00:00.000Z"),
      notes: "Fechas nuevas",
    })

    const response = await PATCH(
      new Request("http://localhost/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vacation.id,
          date: "2026-10-14",
          endDate: "2026-10-27",
          kind: "VACACIONES",
          title: "VACACIONES",
          notes: "Fechas nuevas",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject([
      { id: vacation.id, date: "2026-10-14", endDate: "2026-10-27", notes: "Fechas nuevas" },
    ])
    expect(prismaMock.vacation.update).toHaveBeenCalledWith({
      where: { id: vacation.id },
      data: {
        startDate: new Date("2026-10-14T00:00:00.000Z"),
        endDate: new Date("2026-10-27T00:00:00.000Z"),
        notes: "Fechas nuevas",
      },
    })
  })

  it("deletes manual vacations but keeps annual-plan vacations read-only", async () => {
    prismaMock.vacation.findUnique.mockResolvedValue(vacation)
    const deleted = await DELETE(
      new Request("http://localhost/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vacation.id, kind: "VACACIONES" }),
      }),
    )

    expect(deleted.status).toBe(200)
    expect(prismaMock.vacation.delete).toHaveBeenCalledWith({ where: { id: vacation.id } })

    vi.resetAllMocks()
    configureTransactions()
    const annualVacation = { ...vacation, annualPlanYear: 2026 }
    prismaMock.vacation.findUnique.mockResolvedValue(annualVacation)
    const edited = await PATCH(
      new Request("http://localhost/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vacation.id,
          date: "2026-10-14",
          endDate: "2026-10-27",
          kind: "VACACIONES",
          title: "VACACIONES",
        }),
      }),
    )
    const removed = await DELETE(
      new Request("http://localhost/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vacation.id, kind: "VACACIONES" }),
      }),
    )

    expect(edited.status).toBe(409)
    expect(removed.status).toBe(409)
    expect(prismaMock.vacation.update).not.toHaveBeenCalled()
    expect(prismaMock.vacation.delete).not.toHaveBeenCalled()
  })
})

describe("Replacement people route", () => {
  it("lists active people by default and supports including inactive contacts", async () => {
    prismaMock.replacementPerson.findMany.mockResolvedValue([])

    await getPeople(new Request("http://localhost/api/replacement-people?includeInactive=true"))

    expect(prismaMock.replacementPerson.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
  })

  it("creates a trimmed catalog entry and normalizes blank contact fields", async () => {
    prismaMock.replacementPerson.findFirst.mockResolvedValue(null)
    prismaMock.replacementPerson.create.mockResolvedValue({ id: "person-1", name: "Ana" })
    const response = await createPerson(
      new Request("http://localhost/api/replacement-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: " Ana ", phone: " ", email: "", notes: " " }),
      }),
    )

    expect(response.status).toBe(201)
    expect(prismaMock.replacementPerson.create).toHaveBeenCalledWith({
      data: { name: "Ana", phone: null, email: null, notes: null },
    })
  })

  it("deactivates a contact with coverage history instead of deleting it", async () => {
    prismaMock.replacementPerson.findUnique.mockResolvedValue({
      id: "person-1",
      _count: { coverages: 2 },
    })
    prismaMock.replacementPerson.update.mockResolvedValue({ id: "person-1", active: false })
    const response = await deletePerson(
      new Request("http://localhost/api/replacement-people", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "person-1" }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ deleted: false, deactivated: true })
    expect(prismaMock.replacementPerson.update).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: { active: false },
    })
    expect(prismaMock.replacementPerson.delete).not.toHaveBeenCalled()
  })
})
