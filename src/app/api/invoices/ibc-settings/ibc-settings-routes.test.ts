import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  invoice: { findMany: vi.fn() },
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { GET, PATCH } from "./route"

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/invoices/ibc-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  prismaMock.invoice.findMany.mockResolvedValue([
    { institutionName: "SOCIEDAD MEDICA ANTIOQUEÑA SA" },
    { institutionName: "Sedarte IPS" },
    { institutionName: null },
  ])
  prismaMock.appSetting.findUnique.mockResolvedValue({ value: ["Sociedad Médica Antioqueña S.A."] })
  prismaMock.appSetting.upsert.mockResolvedValue({})
})

describe("IBC institution settings route", () => {
  it("lists entities from invoices and the configured selection", async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      institutions: ["SOCIEDAD MEDICA ANTIOQUEÑA SA", "Sedarte IPS"],
      includedInstitutions: ["Sociedad Médica Antioqueña S.A."],
    })
  })

  it("deduplicates equivalent institution names before saving", async () => {
    const response = await PATCH(patchRequest({ includedInstitutions: ["Soma IPS", "SOMA I.P.S.", "Sedarte"] }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ includedInstitutions: ["Soma IPS", "Sedarte"] })
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "billing.ibc.includedInstitutions" },
      create: { key: "billing.ibc.includedInstitutions", value: ["Soma IPS", "Sedarte"] },
      update: { value: ["Soma IPS", "Sedarte"] },
    })
  })

  it("makes a newly configured entity available to invoice forms", async () => {
    let savedInstitutions: string[] = []
    prismaMock.appSetting.upsert.mockImplementation(
      async ({ create, update }: { create: { value: string[] }; update: { value: string[] } }) => {
        savedInstitutions = update.value ?? create.value
        prismaMock.appSetting.findUnique.mockResolvedValue({ value: savedInstitutions })
        return { value: savedInstitutions }
      },
    )

    const saved = await PATCH(patchRequest({ includedInstitutions: ["Nueva Clínica"] }))
    const settings = await GET()

    expect(saved.status).toBe(200)
    expect(await settings.json()).toMatchObject({
      institutions: expect.arrayContaining(["Nueva Clínica"]),
      includedInstitutions: ["Nueva Clínica"],
    })
  })

  it("rejects invalid institution settings without writes", async () => {
    const response = await PATCH(patchRequest({ includedInstitutions: [""] }))
    expect(response.status).toBe(400)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })
})
