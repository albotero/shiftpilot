import { PrismaClient } from "@prisma/client"
import { getSomaAnnualPlanKey, somaAnnualPlanSchema } from "../src/lib/calendar/annual-plan"
import { generateSomaRotation } from "../src/lib/calendar/soma-rotation"

const prisma = new PrismaClient()

async function main() {
  const setting = await prisma.appSetting.findUnique({ where: { key: getSomaAnnualPlanKey(2026) } })
  if (!setting) throw new Error("No saved Soma annual plan for 2026.")
  const parsed = somaAnnualPlanSchema.safeParse(setting.value)
  if (!parsed.success) throw new Error("The saved Soma 2026 plan is invalid.")

  const plan = parsed.data
  const days = generateSomaRotation(plan.mainStartDate, plan.mainEndDate, plan.anchorDate, plan.anchorStatus)
  const firstDate = new Date(`${plan.mainStartDate}T00:00:00.000Z`)
  const lastDate = new Date(`${plan.mainEndDate}T00:00:00.000Z`)
  const existing = await prisma.shift.findMany({
    where: { work: { name: "Soma" }, date: { gte: firstDate, lte: lastDate } },
    select: { id: true, date: true, period: true, status: true },
  })
  const expectedCount = days.length * 2
  if (existing.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} Soma shifts, found ${existing.length}; no rows were changed.`)
  }

  const expectedByKey = new Map(
    days.flatMap((day) =>
      (["AM", "PM"] as const).map((period) => [
        `${day.date}:${period}`,
        { date: day.date, period, status: day.status },
      ]),
    ),
  )
  const updates: Array<{ id: string; status: "LIBRE" }> = []

  for (const shift of existing) {
    const date = shift.date.toISOString().slice(0, 10)
    const key = `${date}:${shift.period}`
    const expected = expectedByKey.get(key)
    if (!expected) throw new Error(`Unexpected Soma shift ${key}; no rows were changed.`)
    if (shift.status === expected.status) continue

    const isSunday = new Date(`${date}T12:00:00.000Z`).getUTCDay() === 0
    if (isSunday && shift.status === "TURNO" && expected.status === "LIBRE") {
      updates.push({ id: shift.id, status: "LIBRE" })
      continue
    }

    throw new Error(
      `Unexpected edited Soma status on ${key}: ${shift.status} (expected ${expected.status}); no rows were changed.`,
    )
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.shift.update({
          where: { id: update.id },
          data: { status: update.status },
        }),
      ),
    )
  }

  console.log(
    `Soma Sundays reconciled: ${updates.length} AM/PM shifts set to LIBRE; scheduled TURNO Sundays preserved.`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
