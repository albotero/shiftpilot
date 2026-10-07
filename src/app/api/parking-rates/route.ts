import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { assertMoneyAmount } from "@/lib/money/integer"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

type ParkingRateDatabase = Pick<Prisma.TransactionClient, "parkingRate">

const parkingRateSchema = z.object({
  year: z.number().int().min(1900).max(9998),
  amount: z.number().finite().nonnegative(),
})

function validYear(value: string | null) {
  if (!value || !/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return year >= 1900 && year <= 9998 ? year : null
}

async function readRate(database: ParkingRateDatabase, year: number) {
  const rate = await database.parkingRate.findUnique({ where: { year } })
  return { year, amount: Number(rate?.amount ?? 0) }
}

export async function GET(request: Request) {
  const year = validYear(new URL(request.url).searchParams.get("year"))
  if (year === null) return Response.json({ error: "Año inválido" }, { status: 400 })

  try {
    return Response.json(await readRate(prisma, year))
  } catch {
    return Response.json({ error: "No se pudo consultar la tarifa de parqueadero" }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = parkingRateSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Año o tarifa inválidos" }, { status: 400 })
  try {
    assertMoneyAmount(parsed.data.amount, "parking amount")
  } catch {
    return Response.json({ error: "La tarifa admite máximo tres decimales en miles de COP" }, { status: 400 })
  }

  try {
    await prisma.parkingRate.upsert({
      where: { year: parsed.data.year },
      create: parsed.data,
      update: { amount: parsed.data.amount },
    })
    return Response.json(await readRate(prisma, parsed.data.year))
  } catch {
    return Response.json({ error: "No se pudo guardar la tarifa de parqueadero" }, { status: 503 })
  }
}
