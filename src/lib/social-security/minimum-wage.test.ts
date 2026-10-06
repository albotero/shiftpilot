import { describe, expect, it, vi } from "vitest"
import { fetchOfficialMinimumWage, getMinimumWageForYear, parseMinimumWageFromOfficialArticle } from "./minimum-wage"

const mintrabajoArticle = `
  <p>El Gobierno fijó el salario básico en $1.750.905 pesos para 2026, más un auxilio de transporte de $249.095,
  para un total de $2.000.000 mensuales.</p>
`

describe("annual Colombian minimum wage", () => {
  it("extracts the basic monthly wage without including the transport allowance", () => {
    expect(parseMinimumWageFromOfficialArticle(mintrabajoArticle, 2026)).toBe(1_750_905)
    expect(parseMinimumWageFromOfficialArticle(mintrabajoArticle, 2027)).toBeNull()
  })

  it("discovers the official annual article and extracts the basic wage", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith("/comunicados-2026")) {
        return new Response(
          '<a href="/web/guest/mintrabajo-habilita-codigo-qr-para-denuncias-por-incumplimiento-del-nuevo-incremento-del-salario-minimo-vital">MinTrabajo habilita código QR por el nuevo incremento del salario mínimo vital</a>',
          { status: 200 },
        )
      }
      return new Response(mintrabajoArticle, { status: 200 })
    })

    await expect(fetchOfficialMinimumWage(2026, fetcher)).resolves.toEqual({
      year: 2026,
      sourceYear: 2026,
      amountCop: 1_750_905,
      sourceUrl:
        "https://www.mintrabajo.gov.co/web/guest/mintrabajo-habilita-codigo-qr-para-denuncias-por-incumplimiento-del-nuevo-incremento-del-salario-minimo-vital",
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("caches a newly fetched year so later requests do not hit MinTrabajo again", async () => {
    const appSetting = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            key: "socialSecurity.minimumWageCop.2026",
            value: {
              year: 2026,
              amountCop: 1_750_905,
              sourceUrl: "https://www.mintrabajo.gov.co/official-2026",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ]),
      upsert: vi.fn().mockResolvedValue({}),
    }
    const database = { appSetting } as never
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<a href="/web/guest/mintrabajo-habilita-codigo-qr-para-denuncias-por-incumplimiento-del-nuevo-incremento-del-salario-minimo-vital">Nuevo incremento del salario mínimo vital</a>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(mintrabajoArticle, { status: 200 }))

    const first = await getMinimumWageForYear(database, 2026, fetcher)
    const callsAfterRefresh = fetcher.mock.calls.length
    const second = await getMinimumWageForYear(database, 2026, fetcher)

    expect(first.amountCop).toBe(1_750_905)
    expect(second.stale).toBe(false)
    expect(appSetting.upsert).toHaveBeenCalledTimes(1)
    expect(callsAfterRefresh).toBe(2)
    expect(fetcher).toHaveBeenCalledTimes(callsAfterRefresh)
  })

  it("uses the last verified year's wage with a stale warning when the source is unavailable", async () => {
    const appSetting = {
      findMany: vi.fn().mockResolvedValue([
        {
          key: "socialSecurity.minimumWageCop.2026",
          value: {
            year: 2026,
            amountCop: 1_750_905,
            sourceUrl: "https://www.mintrabajo.gov.co/official-2026",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ]),
      upsert: vi.fn(),
    }

    const wage = await getMinimumWageForYear(
      { appSetting } as never,
      2027,
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    )

    expect(wage).toMatchObject({ year: 2027, sourceYear: 2026, amountCop: 1_750_905, stale: true })
    expect(appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "socialSecurity.minimumWageChecked.2027" },
      create: {
        key: "socialSecurity.minimumWageChecked.2027",
        value: expect.objectContaining({ checkedAt: expect.any(String) }),
      },
      update: { value: expect.objectContaining({ checkedAt: expect.any(String) }) },
    })
  })

  it("does not retry the official source more than once per day for a missing year", async () => {
    const appSetting = {
      findMany: vi.fn().mockResolvedValue([
        {
          key: "socialSecurity.minimumWageCop.2026",
          value: {
            year: 2026,
            amountCop: 1_750_905,
            sourceUrl: "https://www.mintrabajo.gov.co/official-2026",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        {
          key: "socialSecurity.minimumWageChecked.2027",
          value: { checkedAt: new Date(Date.now() - 60_000).toISOString() },
        },
      ]),
      upsert: vi.fn(),
    }
    const fetcher = vi.fn()

    const wage = await getMinimumWageForYear({ appSetting } as never, 2027, fetcher)

    expect(wage).toMatchObject({ year: 2027, sourceYear: 2026, amountCop: 1_750_905, stale: true })
    expect(fetcher).not.toHaveBeenCalled()
    expect(appSetting.upsert).not.toHaveBeenCalled()
  })
})
