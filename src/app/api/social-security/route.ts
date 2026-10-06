import { z } from "zod"
import { getMinimumWageForYear } from "@/lib/social-security/minimum-wage"
import { recalculateSocialSecurityPeriod } from "@/lib/social-security/period"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const configurationSchema = z.object({
  pensionEnabled: z.boolean(),
  arlEnabled: z.boolean(),
  arlRiskClass: z.enum(["I", "II", "III", "IV", "V"]),
  compensationFundEnabled: z.boolean(),
})

function validMonth(month: string | null): month is string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return false
  const [year, monthNumber] = month.split("-").map(Number)
  return year >= 1900 && year <= 9998 && monthNumber >= 1 && monthNumber <= 12
}

async function getMinimumWageForMonth(month: string) {
  const year = Number(month.slice(0, 4))
  const savedPeriod = await prisma.socialSecurityPeriod.findUnique({
    where: { month: new Date(`${month}-01T00:00:00.000Z`) },
    select: {
      minimumWageCop: true,
      minimumWageSourceYear: true,
      minimumWageSourceUrl: true,
      minimumWageStale: true,
    },
  })
  if (typeof savedPeriod?.minimumWageCop === "number" && typeof savedPeriod.minimumWageSourceUrl === "string") {
    return {
      year,
      sourceYear: savedPeriod.minimumWageSourceYear ?? year,
      amountCop: savedPeriod.minimumWageCop,
      sourceUrl: savedPeriod.minimumWageSourceUrl,
      stale: savedPeriod.minimumWageStale ?? false,
    }
  }
  return getMinimumWageForYear(prisma, year)
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month")
  if (!validMonth(month)) return Response.json({ error: "Mes inválido" }, { status: 400 })

  try {
    const minimumWage = await getMinimumWageForMonth(month)
    const result = await prisma.$transaction((transaction) =>
      recalculateSocialSecurityPeriod(transaction, month, minimumWage),
    )
    return Response.json(result)
  } catch {
    return Response.json({ error: "No se pudo calcular la seguridad social del mes" }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = z.object({ month: z.string(), configuration: configurationSchema }).safeParse(body)
  if (!parsed.success || !validMonth(parsed.data?.month ?? null)) {
    return Response.json({ error: "Mes o configuración inválida" }, { status: 400 })
  }

  try {
    const minimumWage = await getMinimumWageForMonth(parsed.data.month)
    const result = await prisma.$transaction(async (transaction) => {
      return recalculateSocialSecurityPeriod(transaction, parsed.data.month, minimumWage, parsed.data.configuration)
    })
    return Response.json(result)
  } catch {
    return Response.json({ error: "No se pudo guardar la configuración de seguridad social" }, { status: 503 })
  }
}
