import { z } from "zod"
import { uniqueInstitutionNames } from "@/lib/billing/ibc-institutions"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const SETTING_KEY = "billing.ibc.includedInstitutions"
const institutionsSchema = z.object({
  includedInstitutions: z.array(z.string().trim().min(1).max(160)).max(100),
})

export async function GET() {
  try {
    const [invoices, setting] = await Promise.all([
      prisma.invoice.findMany({ where: { institutionName: { not: null } }, select: { institutionName: true } }),
      prisma.appSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } }),
    ])
    const configured = Array.isArray(setting?.value)
      ? setting.value.filter((name): name is string => typeof name === "string")
      : []
    const institutions = uniqueInstitutionNames([
      ...invoices.map((invoice) => invoice.institutionName ?? ""),
      ...configured,
    ])
    return Response.json({
      institutions,
      includedInstitutions: uniqueInstitutionNames(configured),
    })
  } catch {
    return Response.json({ error: "No se pudo consultar la configuración del IBC" }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }
  const parsed = institutionsSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "La lista de instituciones no es válida" }, { status: 400 })

  const includedInstitutions = uniqueInstitutionNames(parsed.data.includedInstitutions)
  try {
    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: includedInstitutions },
      update: { value: includedInstitutions },
    })
    return Response.json({ includedInstitutions })
  } catch {
    return Response.json({ error: "No se pudo guardar la configuración del IBC" }, { status: 503 })
  }
}
