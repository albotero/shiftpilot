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
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    event: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    vacation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { DELETE, POST } from "./route"
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
