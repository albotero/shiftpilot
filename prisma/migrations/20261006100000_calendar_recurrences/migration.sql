CREATE TYPE "RecurringEntryKind" AS ENUM ('SOMA', 'PERSONAL');

CREATE TYPE "RecurrencePeriod" AS ENUM ('AM', 'PM', 'AM_PM', 'NOCHE');

CREATE TABLE "CalendarRecurrence" (
    "id" TEXT NOT NULL,
    "workId" TEXT,
    "kind" "RecurringEntryKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "weekday" INTEGER NOT NULL,
    "skipHolidays" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "status" "SomaShiftStatus",
    "period" "RecurrencePeriod",
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarRecurrence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarRecurrence_startDate_endDate_weekday_idx"
ON "CalendarRecurrence"("startDate", "endDate", "weekday");

CREATE INDEX "CalendarRecurrence_kind_weekday_idx"
ON "CalendarRecurrence"("kind", "weekday");

ALTER TABLE "CalendarRecurrence"
ADD CONSTRAINT "CalendarRecurrence_workId_fkey"
FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;