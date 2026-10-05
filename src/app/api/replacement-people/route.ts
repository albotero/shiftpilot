import { z } from "zod"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

const optionalContactField = (maxLength: number) =>
  z.union([z.string().trim().max(maxLength), z.literal("")]).optional()

const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: optionalContactField(40),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  notes: optionalContactField(500),
})

const updatePersonSchema = createPersonSchema
  .partial()
  .extend({ id: z.string().min(1), active: z.boolean().optional() })
  .superRefine((person, context) => {
    if (
      person.name === undefined &&
      person.phone === undefined &&
      person.email === undefined &&
      person.notes === undefined &&
      person.active === undefined
    ) {
      context.addIssue({ code: "custom", message: "Indica al menos un campo para actualizar" })
    }
  })

const deletePersonSchema = z.object({ id: z.string().min(1) })

function normalizeOptional(value: string | undefined) {
  return value?.trim() || null
}

export async function GET(request: Request) {
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true"
    const people = await prisma.replacementPerson.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
    return Response.json(people)
  } catch {
    return Response.json({ error: "No se pudo consultar el catálogo de anestesiólogos" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = createPersonSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Anestesiólogo inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const duplicate = await prisma.replacementPerson.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    })
    if (duplicate) return Response.json({ error: "Ya existe un anestesiólogo con ese nombre" }, { status: 409 })

    const person = await prisma.replacementPerson.create({
      data: {
        name: parsed.data.name,
        phone: normalizeOptional(parsed.data.phone),
        email: normalizeOptional(parsed.data.email),
        notes: normalizeOptional(parsed.data.notes),
      },
    })
    return Response.json(person, { status: 201 })
  } catch {
    return Response.json({ error: "No se pudo guardar el anestesiólogo" }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = updatePersonSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Anestesiólogo inválido", details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const current = await prisma.replacementPerson.findUnique({ where: { id: parsed.data.id } })
    if (!current) return Response.json({ error: "No se encontró el anestesiólogo" }, { status: 404 })

    if (parsed.data.name && parsed.data.name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()) {
      const duplicate = await prisma.replacementPerson.findFirst({
        where: { id: { not: current.id }, name: { equals: parsed.data.name, mode: "insensitive" } },
      })
      if (duplicate) return Response.json({ error: "Ya existe un anestesiólogo con ese nombre" }, { status: 409 })
    }

    const person = await prisma.replacementPerson.update({
      where: { id: current.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: normalizeOptional(parsed.data.phone) } : {}),
        ...(parsed.data.email !== undefined ? { email: normalizeOptional(parsed.data.email) } : {}),
        ...(parsed.data.notes !== undefined ? { notes: normalizeOptional(parsed.data.notes) } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    })
    return Response.json(person)
  } catch {
    return Response.json({ error: "No se pudo actualizar el anestesiólogo" }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 })
  }

  const parsed = deletePersonSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Identificador inválido" }, { status: 400 })

  try {
    const person = await prisma.replacementPerson.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { coverages: true } } },
    })
    if (!person) return Response.json({ error: "No se encontró el anestesiólogo" }, { status: 404 })

    if (person._count.coverages > 0) {
      const deactivated = await prisma.replacementPerson.update({
        where: { id: person.id },
        data: { active: false },
      })
      return Response.json({ deleted: false, deactivated: true, person: deactivated })
    }

    await prisma.replacementPerson.delete({ where: { id: person.id } })
    return Response.json({ deleted: true, id: person.id })
  } catch {
    return Response.json({ error: "No se pudo eliminar el anestesiólogo" }, { status: 503 })
  }
}
