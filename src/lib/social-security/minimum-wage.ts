import type { Prisma } from "@prisma/client"

const officialOrigin = "https://www.mintrabajo.gov.co"
const settingPrefix = "socialSecurity.minimumWageCop."
const checkedPrefix = "socialSecurity.minimumWageChecked."
const refreshIntervalMilliseconds = 24 * 60 * 60 * 1000
const knownMinimumWageCop: Record<number, { amountCop: number; sourceUrl: string }> = {
  2026: {
    amountCop: 1_750_905,
    sourceUrl:
      "https://www.mintrabajo.gov.co/web/guest/mintrabajo-habilita-codigo-qr-para-denuncias-por-incumplimiento-del-nuevo-incremento-del-salario-minimo-vital",
  },
}

export type MinimumWageSnapshot = {
  year: number
  sourceYear: number
  amountCop: number
  sourceUrl: string
  stale: boolean
}

type MinimumWageDatabase = Pick<Prisma.TransactionClient, "appSetting">
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>
type StoredMinimumWage = { year: number; amountCop: number; sourceUrl: string; updatedAt: string }
type StoredMinimumWageCheck = { checkedAt: string }

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, "&")
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
}

function parseCopAmount(value: string) {
  const amount = Number(value.replaceAll(".", "").replaceAll(",", ""))
  return Number.isSafeInteger(amount) && amount >= 1_000_000 && amount <= 10_000_000 ? amount : null
}

export function parseMinimumWageFromOfficialArticle(html: string, year: number) {
  const text = htmlToText(html)
  if (!text.includes(String(year))) return null

  const matches = [
    /salario\s+b[aá]sico\s+(?:mensual\s+)?(?:en|de)\s+\$\s*((?:\d{1,3}(?:\.\d{3})+)|\d+)/i,
    /salario\s+m[ií]nimo(?:\s+legal)?(?:\s+mensual)?(?:\s+vigente)?[^$]{0,100}\$\s*((?:\d{1,3}(?:\.\d{3})+)|\d+)/i,
  ]
  for (const pattern of matches) {
    const match = pattern.exec(text)
    const amount = match?.[1] ? parseCopAmount(match[1]) : null
    if (amount !== null) return amount
  }
  return null
}

function getStoredWage(value: unknown, year: number): MinimumWageSnapshot | null {
  if (typeof value !== "object" || value === null || !("amountCop" in value) || !("sourceUrl" in value)) return null
  const saved = value as Partial<StoredMinimumWage>
  if (saved.year !== year || !Number.isSafeInteger(saved.amountCop) || !saved.sourceUrl?.startsWith(officialOrigin))
    return null
  return { year, sourceYear: year, amountCop: saved.amountCop as number, sourceUrl: saved.sourceUrl, stale: false }
}

function getFallbackWage(records: { key: string; value: unknown }[], year: number) {
  const previous = records
    .map((record) => {
      const match = new RegExp(`^${settingPrefix}(\\d{4})$`).exec(record.key)
      const recordYear = match ? Number(match[1]) : 0
      return { wage: getStoredWage(record.value, recordYear), recordYear }
    })
    .filter((record) => record.recordYear < year && record.wage)
    .sort((left, right) => right.recordYear - left.recordYear)[0]?.wage
  const known = knownMinimumWageCop[year]
  return previous ?? (known ? { year, sourceYear: year, ...known, stale: false } : null)
}

function hasRecentFailedCheck(value: unknown, now: number) {
  if (typeof value !== "object" || value === null || !("checkedAt" in value)) return false
  const checkedAt = Date.parse(String(value.checkedAt))
  return Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt < refreshIntervalMilliseconds
}

export async function fetchOfficialMinimumWage(
  year: number,
  fetcher: Fetcher = fetch,
): Promise<Omit<MinimumWageSnapshot, "stale">> {
  const archiveUrl = `${officialOrigin}/web/guest/comunicados-${year}`
  const archiveResponse = await fetcher(archiveUrl, { signal: AbortSignal.timeout(8_000) })
  if (!archiveResponse.ok) throw new Error(`MinTrabajo respondió ${archiveResponse.status} al consultar ${year}`)
  const archiveHtml = await archiveResponse.text()
  const candidates = [...archiveHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, body]) => ({
      url: new URL(decodeHtml(href), archiveUrl),
      text: htmlToText(body),
    }))
    .filter(
      ({ url, text }) =>
        url.hostname === "www.mintrabajo.gov.co" && /salario\s+m[ií]nimo|salario\s+vital/i.test(`${url.href} ${text}`),
    )
    .sort((left, right) => {
      const leftScore = /nuevo incremento|salario mínimo vital/i.test(`${left.url.href} ${left.text}`) ? 1 : 0
      const rightScore = /nuevo incremento|salario mínimo vital/i.test(`${right.url.href} ${right.text}`) ? 1 : 0
      return rightScore - leftScore
    })

  for (const candidate of candidates.slice(0, 20)) {
    const articleResponse = await fetcher(candidate.url, { signal: AbortSignal.timeout(8_000) })
    if (!articleResponse.ok) continue
    const html = await articleResponse.text()
    const amountCop = parseMinimumWageFromOfficialArticle(html, year)
    if (amountCop !== null) return { year, sourceYear: year, amountCop, sourceUrl: candidate.url.href }
  }
  throw new Error(`No se encontró el salario mínimo oficial de ${year} en el archivo de MinTrabajo`)
}

export async function getMinimumWageForYear(
  database: MinimumWageDatabase,
  year: number,
  fetcher: Fetcher = fetch,
): Promise<MinimumWageSnapshot> {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new RangeError("Año inválido")
  const records = await database.appSetting.findMany({ where: { key: { startsWith: "socialSecurity.minimumWage" } } })
  const exactKey = `${settingPrefix}${year}`
  const current = records.find((record) => record.key === exactKey)
  const cached = current ? getStoredWage(current.value, year) : null
  if (cached) return cached

  const fallback = getFallbackWage(records, year)
  const checked = records.find((record) => record.key === `${checkedPrefix}${year}`)
  if (fallback && checked && hasRecentFailedCheck(checked.value, Date.now())) {
    return { ...fallback, year, stale: true }
  }

  try {
    const currentWage = await fetchOfficialMinimumWage(year, fetcher)
    const stored: StoredMinimumWage = { ...currentWage, updatedAt: new Date().toISOString() }
    await database.appSetting.upsert({
      where: { key: exactKey },
      create: { key: exactKey, value: stored },
      update: { value: stored },
    })
    return { ...currentWage, sourceYear: year, stale: false }
  } catch {
    try {
      const checkKey = `${checkedPrefix}${year}`
      const check: StoredMinimumWageCheck = { checkedAt: new Date().toISOString() }
      await database.appSetting.upsert({
        where: { key: checkKey },
        create: { key: checkKey, value: check },
        update: { value: check },
      })
    } catch {
      // A failed freshness marker must not replace the last verified legal value.
    }
    if (fallback) return { ...fallback, year, stale: true }
    throw new Error(
      `No se pudo verificar el salario mínimo de ${year} con MinTrabajo ni existe un valor anterior guardado`,
    )
  }
}
