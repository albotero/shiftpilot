CREATE TYPE "CalendarReminderMode" AS ENUM ('MINUTES_BEFORE', 'DAY_AT_5_AM');

ALTER TABLE "Shift"
ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderMode" "CalendarReminderMode" NOT NULL DEFAULT 'MINUTES_BEFORE',
ADD COLUMN "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "Shift_reminderMinutesBefore_check" CHECK ("reminderMinutesBefore" BETWEEN 1 AND 10080);

ALTER TABLE "Event"
ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderMode" "CalendarReminderMode" NOT NULL DEFAULT 'MINUTES_BEFORE',
ADD COLUMN "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "Event_reminderMinutesBefore_check" CHECK ("reminderMinutesBefore" BETWEEN 1 AND 10080);

ALTER TABLE "Vacation"
ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderMode" "CalendarReminderMode" NOT NULL DEFAULT 'MINUTES_BEFORE',
ADD COLUMN "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "Vacation_reminderMinutesBefore_check" CHECK ("reminderMinutesBefore" BETWEEN 1 AND 10080);

ALTER TABLE "CalendarRecurrence"
ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderMode" "CalendarReminderMode" NOT NULL DEFAULT 'MINUTES_BEFORE',
ADD COLUMN "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "CalendarRecurrence_reminderMinutesBefore_check" CHECK ("reminderMinutesBefore" BETWEEN 1 AND 10080);

ALTER TABLE "CalendarRecurrenceException"
ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderMode" "CalendarReminderMode" NOT NULL DEFAULT 'MINUTES_BEFORE',
ADD COLUMN "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "CalendarRecurrenceException_reminderMinutesBefore_check" CHECK ("reminderMinutesBefore" BETWEEN 1 AND 10080);

CREATE TABLE "CalendarReminderDelivery" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "claimedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarReminderDelivery_eventKey_key"
ON "CalendarReminderDelivery"("eventKey");

CREATE INDEX "CalendarReminderDelivery_dueAt_sentAt_idx"
ON "CalendarReminderDelivery"("dueAt", "sentAt");