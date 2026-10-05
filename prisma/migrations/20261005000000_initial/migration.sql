-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SomaShiftStatus" AS ENUM ('LIBRE', 'R4', 'R3', 'R2', 'R1', 'TURNO');

-- CreateEnum
CREATE TYPE "ShiftPeriod" AS ENUM ('AM', 'PM');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('SEDARTE', 'PERSONAL');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SOMA_POS', 'SOMA_PREPAGADA', 'SOMA_PARTICULAR', 'SEDARTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDIENTE', 'FACTURADA', 'POR_COBRAR', 'PAGADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" "ShiftPeriod" NOT NULL,
    "status" "SomaShiftStatus" NOT NULL,
    "durationHours" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCoverage" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementPerson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplacementPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacation" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "workId" TEXT,
    "category" "EventCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "serviceDate" DATE NOT NULL,
    "invoiceDate" DATE,
    "expectedPaymentDate" DATE,
    "grossAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "shiftDiscountAmount" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL,
    "privateShiftCount" INTEGER NOT NULL DEFAULT 0,
    "privateShiftAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDIENTE',
    "paidAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialSecurityPeriod" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "grossAmount" INTEGER NOT NULL DEFAULT 0,
    "discounts" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "ibcAmount" INTEGER NOT NULL DEFAULT 0,
    "healthAmountTenths" INTEGER NOT NULL DEFAULT 0,
    "pensionAmountTenths" INTEGER NOT NULL DEFAULT 0,
    "arlAmountTenths" INTEGER NOT NULL DEFAULT 0,
    "fundAmountTenths" INTEGER NOT NULL DEFAULT 0,
    "totalAmountTenths" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialSecurityPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Compra de acciones',
    "shareCount" INTEGER NOT NULL,
    "sharePriceCop" INTEGER NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "contractualRatePpm" INTEGER NOT NULL DEFAULT 80000,
    "lateFeeRatePpm" INTEGER NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtSchedule" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "installment" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "previousBalance" INTEGER NOT NULL,
    "monthlyInterest" INTEGER NOT NULL,
    "paymentAmount" INTEGER NOT NULL,
    "principalAmount" INTEGER NOT NULL,
    "interestAmount" INTEGER NOT NULL,
    "remainingBalance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "parkingAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "principalAmount" INTEGER NOT NULL DEFAULT 0,
    "interestAmount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DebtPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingRate" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Work_name_key" ON "Work"("name");

-- CreateIndex
CREATE INDEX "Shift_date_idx" ON "Shift"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_workId_date_period_key" ON "Shift"("workId", "date", "period");

-- CreateIndex
CREATE INDEX "ShiftCoverage_personId_idx" ON "ShiftCoverage"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCoverage_shiftId_personId_key" ON "ShiftCoverage"("shiftId", "personId");

-- CreateIndex
CREATE INDEX "Vacation_startDate_endDate_idx" ON "Vacation"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Event_date_category_idx" ON "Event"("date", "category");

-- CreateIndex
CREATE INDEX "Invoice_serviceDate_status_idx" ON "Invoice"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "Invoice_expectedPaymentDate_idx" ON "Invoice"("expectedPaymentDate");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialSecurityPeriod_month_key" ON "SocialSecurityPeriod"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_name_key" ON "Debt"("name");

-- CreateIndex
CREATE INDEX "DebtSchedule_dueDate_idx" ON "DebtSchedule"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "DebtSchedule_debtId_installment_key" ON "DebtSchedule"("debtId", "installment");

-- CreateIndex
CREATE INDEX "DebtPayment_paidAt_idx" ON "DebtPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPaymentAllocation_paymentId_scheduleId_key" ON "DebtPaymentAllocation"("paymentId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingRate_year_key" ON "ParkingRate"("year");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCoverage" ADD CONSTRAINT "ShiftCoverage_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCoverage" ADD CONSTRAINT "ShiftCoverage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "ReplacementPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtSchedule" ADD CONSTRAINT "DebtSchedule_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPaymentAllocation" ADD CONSTRAINT "DebtPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DebtPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPaymentAllocation" ADD CONSTRAINT "DebtPaymentAllocation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DebtSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
