CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'INTERVAL');

ALTER TABLE "CalendarRecurrence"
ADD COLUMN "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "dayOfMonth" INTEGER,
ADD COLUMN "lastDayOfMonth" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "intervalDays" INTEGER;

UPDATE "CalendarRecurrence"
SET "weekdays" = ARRAY["weekday"]::INTEGER[]
WHERE "weekday" IS NOT NULL;

ALTER TABLE "CalendarRecurrence"
ALTER COLUMN "weekday" DROP NOT NULL;

ALTER TABLE "CalendarRecurrence"
ADD CONSTRAINT "CalendarRecurrence_frequency_config_check" CHECK (
  ("frequency" = 'WEEKLY' AND cardinality("weekdays") > 0)
  OR ("frequency" = 'MONTHLY' AND (("dayOfMonth" BETWEEN 1 AND 31 AND NOT "lastDayOfMonth") OR ("dayOfMonth" IS NULL AND "lastDayOfMonth")))
  OR ("frequency" = 'INTERVAL' AND "intervalDays" > 0)
);

DROP INDEX "CalendarRecurrence_startDate_endDate_weekday_idx";

CREATE INDEX "CalendarRecurrence_startDate_endDate_idx"
ON "CalendarRecurrence"("startDate", "endDate");