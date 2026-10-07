import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  parkingRate: { findUnique: vi.fn(), upsert: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { GET, PUT } from "./route"

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/parking-rates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.parkingRate.findUnique.mockResolvedValue({ year: 2026, amount: 150 })
  prismaMock.parkingRate.upsert.mockImplementation(async ({ where, create, update }) => ({
    year: where.year,
    ...(create ?? {}),
    ...(update ?? {}),
  }))
})

describe("annual parking rate route", () => {
  it("returns the configured rate for the selected year", async () => {
    const response = await GET(new Request("http://localhost/api/parking-rates?year=2026"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ year: 2026, amount: 150 })
  })

  it("returns zero when a year has no configured rate", async () => {
    prismaMock.parkingRate.findUnique.mockResolvedValue(null)

    const response = await GET(new Request("http://localhost/api/parking-rates?year=2027"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ year: 2027, amount: 0 })
  })

  it("saves an annual rate without changing other years", async () => {
    prismaMock.parkingRate.findUnique.mockResolvedValueOnce({ year: 2027, amount: 175.125 })
    const response = await PUT(jsonRequest({ year: 2027, amount: 175.125 }))

    expect(response.status).toBe(200)
    expect(prismaMock.parkingRate.upsert).toHaveBeenCalledWith({
      where: { year: 2027 },
      create: { year: 2027, amount: 175.125 },
      update: { amount: 175.125 },
    })
    await expect(response.json()).resolves.toMatchObject({ year: 2027, amount: 175.125 })
  })

  it("rejects invalid years and amounts with more than three decimals", async () => {
    const invalidYear = await PUT(jsonRequest({ year: 9999, amount: 150 }))
    const invalidAmount = await PUT(jsonRequest({ year: 2027, amount: 150.0001 }))

    expect(invalidYear.status).toBe(400)
    expect(invalidAmount.status).toBe(400)
    expect(prismaMock.parkingRate.upsert).not.toHaveBeenCalled()
  })
})
