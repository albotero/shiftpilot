import { PrismaClient } from "@prisma/client"
import { getSomaAutomaticNightDates, somaAnnualPlanSchema, type SomaAnnualPlan } from "../src/lib/calendar/annual-plan"

const prisma = new PrismaClient()

async function main() {
  const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: "soma.annualPlan." } } })
  const plans = new Map<number, SomaAnnualPlan>()
  for (const setting of settings) {
    const parsed = somaAnnualPlanSchema.safeParse(setting.value)
    if (parsed.success) plans.set(parsed.data.year, parsed.data)
  }

  const work = await prisma.work.findUnique({ where: { name: "Soma" } })
  if (!work) throw new Error("Falta la configuración inicial de Soma")

  const dates = getSomaAutomaticNightDates(plans)
  const result = await prisma.shift.createMany({
    data: dates.map((date) => ({
      workId: work.id,
      date: new Date(`${date}T00:00:00.000Z`),
      period: "NOCHE" as const,
      status: "NOCHE" as const,
      durationHours: 12,
      manualOverride: false,
    })),
    skipDuplicates: true,
  })
  console.log(`Se agregaron ${result.count} jornadas NOCHE automáticas.`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
