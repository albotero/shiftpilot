CREATE TABLE "CalendarRecurrenceException" (
    "id" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SomaShiftStatus",
    "period" "RecurrencePeriod",
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarRecurrenceException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarRecurrenceException_recurrenceId_date_key"
ON "CalendarRecurrenceException"("recurrenceId", "date");

CREATE INDEX "CalendarRecurrenceException_date_idx"
ON "CalendarRecurrenceException"("date");

ALTER TABLE "CalendarRecurrenceException"
ADD CONSTRAINT "CalendarRecurrenceException_recurrenceId_fkey"
FOREIGN KEY ("recurrenceId") REFERENCES "CalendarRecurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;