import { setTimeout as delay } from "node:timers/promises"
import {
  matchesTelegramPairingCode,
  normalizeTelegramBotUsername,
  parseTelegramPairingMessage,
} from "@/lib/notifications/telegram-pairing"
import type { CalendarEntry } from "@/lib/calendar/types"
import { expandCalendarRecurrence, type CalendarRecurringRule } from "@/lib/calendar/recurrence"
import { runDueReminders, type ReminderDeliveryStore } from "@/lib/notifications/telegram-reminders"
import { sendTelegramMessage } from "@/lib/notifications/telegram-client"
import { prisma } from "@/server/db"

const POLL_INTERVAL_MS = 30_000
const PAIRING_POLL_INTERVAL_MS = 5_000
const CHAT_KEY = "telegram.chat"
const PAIRING_KEY = "telegram.pairing"
const UPDATE_OFFSET_KEY = "telegram.updateOffset"

function settingRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

async function getLinkedChatId() {
  const setting = await prisma.appSetting.findUnique({ where: { key: CHAT_KEY }, select: { value: true } })
  const value = settingRecord(setting?.value)
  return typeof value?.chatId === "string" ? value.chatId : null
}

async function pollTelegramUpdates(token: string, username: string) {
  const offsetSetting = await prisma.appSetting.findUnique({
    where: { key: UPDATE_OFFSET_KEY },
    select: { value: true },
  })
  const offsetValue = settingRecord(offsetSetting?.value)?.offset
  const offset = typeof offsetValue === "number" ? offsetValue : undefined
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset, timeout: 0, allowed_updates: ["message"] }),
    signal: AbortSignal.timeout(10_000),
  })
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean
    description?: string
    result?: unknown[]
  } | null
  if (!response.ok || result?.ok !== true || !Array.isArray(result.result)) {
    throw new Error(result?.description ?? `Telegram getUpdates respondió HTTP ${response.status}`)
  }

  let nextOffset = offset
  for (const update of result.result) {
    if (
      typeof update !== "object" ||
      update === null ||
      !("update_id" in update) ||
      typeof update.update_id !== "number"
    ) {
      continue
    }
    nextOffset = Math.max(nextOffset ?? 0, update.update_id + 1)
    const pairingMessage = parseTelegramPairingMessage(update)
    if (!pairingMessage) continue

    const linked = await prisma.$transaction(async (transaction) => {
      const setting = await transaction.appSetting.findUnique({
        where: { key: PAIRING_KEY },
        select: { value: true },
      })
      const pending = settingRecord(setting?.value)
      const codeHash = pending?.codeHash
      const expiresAt = typeof pending?.expiresAt === "string" ? Date.parse(pending.expiresAt) : NaN
      if (
        typeof codeHash !== "string" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now() ||
        !matchesTelegramPairingCode(pairingMessage.code, codeHash)
      ) {
        return false
      }
      await transaction.appSetting.upsert({
        where: { key: CHAT_KEY },
        create: { key: CHAT_KEY, value: { chatId: pairingMessage.chatId, linkedAt: new Date().toISOString() } },
        update: { value: { chatId: pairingMessage.chatId, linkedAt: new Date().toISOString() } },
      })
      await transaction.appSetting.deleteMany({ where: { key: PAIRING_KEY } })
      return true
    })
    if (linked) {
      console.info(`[telegram-reminders] Chat privado vinculado al bot @${username}`)
      await sendTelegramMessage(
        token,
        pairingMessage.chatId,
        "Telegram quedó vinculado a ShiftPilot. Recibirás aquí tus recordatorios activos.",
      )
    }
  }

  if (nextOffset !== undefined && nextOffset !== offset) {
    await prisma.appSetting.upsert({
      where: { key: UPDATE_OFFSET_KEY },
      create: { key: UPDATE_OFFSET_KEY, value: { offset: nextOffset } },
      update: { value: { offset: nextOffset } },
    })
  }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function colombianDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return dateKey(result)
}

function toDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

async function getUpcomingEntries(from: string, through: string): Promise<CalendarEntry[]> {
  const fromDate = toDate(from)
  const throughDate = toDate(through)
  const [shifts, events, vacations, recurrences] = await Promise.all([
    prisma.shift.findMany({
      where: { reminderEnabled: true, date: { gte: fromDate, lte: throughDate }, status: { not: "LIBRE" } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
    }),
    prisma.event.findMany({
      where: { reminderEnabled: true, date: { gte: fromDate, lte: throughDate } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.vacation.findMany({
      where: { reminderEnabled: true, startDate: { gte: fromDate, lte: throughDate } },
      orderBy: { startDate: "asc" },
    }),
    prisma.calendarRecurrence.findMany({
      where: {
        startDate: { lte: throughDate },
        OR: [{ endDate: null }, { endDate: { gte: fromDate } }],
        AND: [
          {
            OR: [
              { reminderEnabled: true },
              {
                exceptions: {
                  some: { reminderEnabled: true, date: { gte: fromDate, lte: throughDate } },
                },
              },
            ],
          },
        ],
      },
      include: { exceptions: { where: { date: { gte: fromDate, lte: throughDate } } } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const entries: CalendarEntry[] = [
    ...shifts.map((shift) => ({
      id: shift.id,
      date: dateKey(shift.date),
      kind: "SOMA" as const,
      status: shift.status as CalendarEntry["status"],
      period: shift.period,
      title: shift.status,
      notes: shift.notes ?? undefined,
      reminderEnabled: shift.reminderEnabled,
      reminderMode: shift.reminderMode,
      reminderMinutesBefore: shift.reminderMinutesBefore,
    })),
    ...events.map((event) => ({
      id: event.id,
      date: dateKey(event.date),
      kind: event.category,
      title: event.title,
      ...(event.startTime ? { startTime: event.startTime } : {}),
      ...(event.durationMinutes !== null ? { durationHours: event.durationMinutes / 60 } : {}),
      ...(event.location ? { location: event.location } : {}),
      ...(event.notes ? { notes: event.notes } : {}),
      reminderEnabled: event.reminderEnabled,
      reminderMode: event.reminderMode,
      reminderMinutesBefore: event.reminderMinutesBefore,
    })),
    ...vacations.map((vacation) => ({
      id: vacation.id,
      date: dateKey(vacation.startDate),
      kind: "VACACIONES" as const,
      title: "VACACIONES",
      ...(vacation.endDate ? { endDate: dateKey(vacation.endDate) } : {}),
      ...(vacation.notes ? { notes: vacation.notes } : {}),
      reminderEnabled: vacation.reminderEnabled,
      reminderMode: vacation.reminderMode,
      reminderMinutesBefore: vacation.reminderMinutesBefore,
    })),
    ...recurrences.flatMap((rule) => {
      const recurringRule: CalendarRecurringRule = {
        id: rule.id,
        kind: rule.kind,
        frequency: rule.frequency,
        startDate: dateKey(rule.startDate),
        endDate: rule.endDate ? dateKey(rule.endDate) : null,
        weekday: rule.weekday ?? undefined,
        weekdays: rule.weekdays,
        dayOfMonth: rule.dayOfMonth,
        lastDayOfMonth: rule.lastDayOfMonth,
        intervalDays: rule.intervalDays,
        skipHolidays: rule.skipHolidays,
        title: rule.title,
        ...(rule.status ? { status: rule.status as CalendarEntry["status"] } : {}),
        ...(rule.period ? { period: rule.period } : {}),
        ...(rule.startTime ? { startTime: rule.startTime } : {}),
        ...(rule.durationMinutes !== null ? { durationMinutes: rule.durationMinutes } : {}),
        ...(rule.location ? { location: rule.location } : {}),
        ...(rule.notes ? { notes: rule.notes } : {}),
        reminderEnabled: rule.reminderEnabled,
        reminderMode: rule.reminderMode,
        reminderMinutesBefore: rule.reminderMinutesBefore,
      }
      const overrides = rule.exceptions.map((exception) => ({
        date: dateKey(exception.date),
        title: exception.title,
        status: exception.status as CalendarEntry["status"],
        period: exception.period,
        startTime: exception.startTime,
        durationMinutes: exception.durationMinutes,
        location: exception.location,
        notes: exception.notes,
        reminderEnabled: exception.reminderEnabled,
        reminderMode: exception.reminderMode,
        reminderMinutesBefore: exception.reminderMinutesBefore,
      }))
      return expandCalendarRecurrence(recurringRule, from, through, overrides)
    }),
  ]

  return entries
}

const deliveryStore: ReminderDeliveryStore = {
  async claim(eventKey, dueAt, claimedUntil) {
    await prisma.calendarReminderDelivery.upsert({
      where: { eventKey },
      create: { eventKey, dueAt },
      update: { dueAt },
    })
    const claim = await prisma.calendarReminderDelivery.updateMany({
      where: {
        eventKey,
        sentAt: null,
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: { claimedUntil, attempts: { increment: 1 }, lastError: null },
    })
    return claim.count === 1
  },
  async markSent(eventKey, sentAt) {
    await prisma.calendarReminderDelivery.update({
      where: { eventKey },
      data: { sentAt, claimedUntil: null, lastError: null },
    })
  },
  async markFailed(eventKey, error) {
    await prisma.calendarReminderDelivery.update({
      where: { eventKey },
      data: { claimedUntil: null, lastError: error },
    })
  },
}

async function runWorker() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? ""
  const username = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME ?? "")
  const botConfigured = Boolean(token && username)
  if (!botConfigured)
    console.warn("[telegram-reminders] Configura TELEGRAM_BOT_TOKEN y TELEGRAM_BOT_USERNAME para activar el vínculo")

  while (true) {
    try {
      let linkedChatId: string | null = null
      if (botConfigured) {
        await pollTelegramUpdates(token, username)
        linkedChatId = await getLinkedChatId()
      }
      if (token && linkedChatId) {
        const now = new Date()
        const from = colombianDateKey(now)
        const through = addDays(from, 8)
        const entries = await getUpcomingEntries(from, through)
        const result = await runDueReminders(entries, now, deliveryStore, (message) =>
          sendTelegramMessage(token, linkedChatId!, message),
        )
        if (result.sent || result.failed) {
          console.info(`[telegram-reminders] enviados=${result.sent} fallidos=${result.failed}`)
        }
      }
    } catch (error) {
      console.error("[telegram-reminders] Falló el ciclo de recordatorios", error)
    }
    await delay(botConfigured && !(await getLinkedChatId()) ? PAIRING_POLL_INTERVAL_MS : POLL_INTERVAL_MS)
  }
}

void runWorker()
