import { PrismaClient } from "@prisma/client"
import { initialDebtSchedule } from "./debt-schedule"

const prisma = new PrismaClient()

const settings = [
  ["soma.amHours", 6],
  ["soma.pmHours", 6],
  ["billing.pos.paymentDays", 90],
  ["billing.pos.discountPpm", 120_000],
  ["billing.prepaid.paymentDays", 60],
  ["billing.prepaid.discountPpm", 200_000],
  ["billing.particular.paymentDays", 30],
  ["billing.particular.discountPpm", 120_000],
  ["billing.particular.shiftAmount", 685],
  ["billing.sedarte.discountPpm", 0],
  ["socialSecurity.ibcRatePpm", 400_000],
  ["socialSecurity.healthRatePpm", 125_000],
  ["socialSecurity.pensionRatePpm", 160_000],
  ["socialSecurity.arlRatePpm", 24_360],
  ["socialSecurity.fundRatePpm", 10_000],
  ["debt.contractualRatePpm", 80_000],
  ["debt.lateFeeRatePpm", 0],
] as const

async function main() {
  await prisma.work.upsert({ where: { name: "Soma" }, create: { name: "Soma" }, update: {} })
  await prisma.work.upsert({ where: { name: "Sedarte" }, create: { name: "Sedarte" }, update: {} })

  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }

  await prisma.parkingRate.upsert({
    where: { year: 2026 },
    create: { year: 2026, amount: 150 },
    update: {},
  })

  const debt = await prisma.debt.upsert({
    where: { name: "Compra de acciones" },
    create: {
      name: "Compra de acciones",
      shareCount: 20_316,
      sharePriceAmount: 35.5,
      originalAmount: 721_218,
      contractualRatePpm: 80_000,
      lateFeeRatePpm: 0,
      termMonths: 72,
      startDate: new Date("2024-05-01T00:00:00.000Z"),
    },
    update: {},
  })

  const existingSchedule = await prisma.debtSchedule.findMany({
    where: { debtId: debt.id },
    orderBy: { installment: "asc" },
  })

  if (existingSchedule.length === 0) {
    await prisma.$transaction(
      initialDebtSchedule.map(
        (
          [month, previousBalance, monthlyInterest, paymentAmount, interestAmount, principalAmount, remainingBalance],
          index,
        ) =>
          prisma.debtSchedule.create({
            data: {
              debtId: debt.id,
              installment: index + 1,
              dueDate: new Date(`${month}-01T00:00:00.000Z`),
              previousBalance,
              monthlyInterest,
              paymentAmount,
              interestAmount,
              principalAmount,
              remainingBalance,
            },
          }),
      ),
    )
  } else {
    const matchesSource =
      existingSchedule.length === initialDebtSchedule.length &&
      existingSchedule.every((record, index) => {
        const [
          month,
          previousBalance,
          monthlyInterest,
          paymentAmount,
          interestAmount,
          principalAmount,
          remainingBalance,
        ] = initialDebtSchedule[index]
        return (
          record.installment === index + 1 &&
          record.dueDate.toISOString().slice(0, 7) === month &&
          Number(record.previousBalance) === previousBalance &&
          Number(record.monthlyInterest) === monthlyInterest &&
          Number(record.paymentAmount) === paymentAmount &&
          Number(record.interestAmount) === interestAmount &&
          Number(record.principalAmount) === principalAmount &&
          Number(record.remainingBalance) === remainingBalance
        )
      })

    if (!matchesSource) throw new Error("El plan existente no coincide con el calendario original; no se modificó.")
  }

  const existingPayment = await prisma.debtPayment.findFirst({
    where: { debtId: debt.id, paidAt: new Date("2026-07-11T00:00:00.000Z") },
  })

  if (!existingPayment) {
    await prisma.debtPayment.create({
      data: {
        debtId: debt.id,
        paidAt: new Date("2026-07-11T00:00:00.000Z"),
        amount: 11_647,
        parkingAmount: 150,
        notes: "Último pago informado inicialmente; transferencia total 11.797.",
      },
    })
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
