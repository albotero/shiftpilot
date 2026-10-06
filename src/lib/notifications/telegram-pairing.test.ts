import { describe, expect, it } from "vitest"
import {
  createTelegramStartUrl,
  hashTelegramPairingCode,
  matchesTelegramPairingCode,
  normalizeTelegramBotUsername,
  parseTelegramPairingMessage,
} from "./telegram-pairing"

describe("Telegram bot pairing", () => {
  it("uses the configured bot username only to construct its start link", () => {
    expect(normalizeTelegramBotUsername("@ShiftPilotBot")).toBe("ShiftPilotBot")
    expect(createTelegramStartUrl("@ShiftPilotBot", "temporary-code_123456")).toBe(
      "https://t.me/ShiftPilotBot?start=temporary-code_123456",
    )
  })

  it("extracts a pairing payload and chat ID only from private /start messages", () => {
    const update = {
      message: {
        text: "/start@ShiftPilotBot temporary-code_123456",
        chat: { id: 123456789, type: "private" },
      },
    }

    expect(parseTelegramPairingMessage(update)).toEqual({ chatId: "123456789", code: "temporary-code_123456" })
    expect(
      parseTelegramPairingMessage({
        message: { text: "/start temporary-code_123456", chat: { id: -100, type: "group" } },
      }),
    ).toBeNull()
    expect(parseTelegramPairingMessage({ message: { text: "/start", chat: { id: 123, type: "private" } } })).toBeNull()
  })

  it("stores a hash and verifies the one-time pairing code", () => {
    const hash = hashTelegramPairingCode("temporary-code_123456")

    expect(hash).not.toContain("temporary-code")
    expect(matchesTelegramPairingCode("temporary-code_123456", hash)).toBe(true)
    expect(matchesTelegramPairingCode("another-code_123456", hash)).toBe(false)
    expect(matchesTelegramPairingCode("temporary-code_123456", "invalid-hash")).toBe(false)
  })
})
