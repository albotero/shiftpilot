import { describe, expect, it, vi } from "vitest"
import type { CalendarEntry } from "@/lib/calendar/types"
import {
  buildReminderMessage,
  getReminderSchedule,
  runDueReminders,
  type ReminderDeliveryStore,
} from "./telegram-reminders"

const personalEvent: CalendarEntry = {
  id: "event-1",
  date: "2026-10-07",
  kind: "PERSONAL",
  title: "Cita médica",
  startTime: "09:00",
  reminderEnabled: true,
  reminderMode: "MINUTES_BEFORE",
  reminderMinutesBefore: 30,
}

function createStore(): ReminderDeliveryStore {
  return {
    claim: vi.fn().mockResolvedValue(true),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  }
}

describe("Telegram calendar reminders", () => {
  it("schedules minutes-before reminders in Colombia time", () => {
    const notDue = getReminderSchedule(personalEvent, new Date("2026-10-07T13:29:59.000Z"))
    const due = getReminderSchedule(personalEvent, new Date("2026-10-07T13:30:00.000Z"))

    expect(notDue).toBeNull()
    expect(due).toEqual({
      eventAt: new Date("2026-10-07T14:00:00.000Z"),
      dueAt: new Date("2026-10-07T13:30:00.000Z"),
    })
  })

  it("sends day-at-five reminders only from 5am and before a timed event", () => {
    const entry = { ...personalEvent, reminderMode: "DAY_AT_5_AM" as const }
    expect(getReminderSchedule(entry, new Date("2026-10-07T09:59:59.000Z"))).toBeNull()
    expect(getReminderSchedule(entry, new Date("2026-10-07T10:00:00.000Z"))).toEqual({
      eventAt: new Date("2026-10-07T14:00:00.000Z"),
      dueAt: new Date("2026-10-07T10:00:00.000Z"),
    })
    expect(getReminderSchedule(entry, new Date("2026-10-07T14:00:00.000Z"))).toBeNull()
    expect(getReminderSchedule({ ...entry, startTime: undefined }, new Date("2026-10-07T10:16:00.000Z"))).toBeNull()
  })

  it("uses 5am as the event time for all-day events", () => {
    const entry = { ...personalEvent, startTime: undefined, reminderMinutesBefore: 60 }
    expect(getReminderSchedule(entry, new Date("2026-10-07T09:00:00.000Z"))).toEqual({
      eventAt: new Date("2026-10-07T10:00:00.000Z"),
      dueAt: new Date("2026-10-07T09:00:00.000Z"),
    })
  })

  it("does not send when reminders are disabled or the event has passed", () => {
    expect(
      getReminderSchedule({ ...personalEvent, reminderEnabled: false }, new Date("2026-10-07T13:30:00Z")),
    ).toBeNull()
    expect(getReminderSchedule(personalEvent, new Date("2026-10-07T14:00:00Z"))).toBeNull()
  })

  it("records successful delivery and releases the claim after a send failure", async () => {
    const store = createStore()
    const send = vi.fn().mockResolvedValue(undefined)
    const result = await runDueReminders([personalEvent], new Date("2026-10-07T13:30:00.000Z"), store, send)

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(store.claim).toHaveBeenCalledWith(
      "calendar:PERSONAL:event-1:2026-10-07",
      new Date("2026-10-07T13:30:00.000Z"),
      new Date("2026-10-07T13:32:00.000Z"),
    )
    expect(store.markSent).toHaveBeenCalledOnce()

    const retryStore = createStore()
    const failedSend = vi.fn().mockRejectedValue(new Error("Telegram no disponible"))
    const failed = await runDueReminders([personalEvent], new Date("2026-10-07T13:30:00.000Z"), retryStore, failedSend)
    expect(failed).toEqual({ sent: 0, skipped: 0, failed: 1 })
    expect(retryStore.markFailed).toHaveBeenCalledWith("calendar:PERSONAL:event-1:2026-10-07", "Telegram no disponible")
  })

  it("formats the event details as a plain Telegram message", () => {
    expect(buildReminderMessage(personalEvent)).toContain("Evento personal: Cita médica")
    expect(buildReminderMessage(personalEvent)).toContain("Hora: 09:00")
  })
})
