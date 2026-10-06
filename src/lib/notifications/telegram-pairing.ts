import { createHash, timingSafeEqual } from "node:crypto"

export type TelegramPairingMessage = { chatId: string; code: string }

export function normalizeTelegramBotUsername(username: string) {
  return username.trim().replace(/^@/, "")
}

export function createTelegramStartUrl(username: string, code: string) {
  const normalizedUsername = normalizeTelegramBotUsername(username)
  return `https://t.me/${normalizedUsername}?start=${encodeURIComponent(code)}`
}

export function hashTelegramPairingCode(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

export function matchesTelegramPairingCode(code: string, expectedHash: string) {
  if (!/^[a-f\d]{64}$/i.test(expectedHash)) return false
  const actual = Buffer.from(hashTelegramPairingCode(code), "hex")
  const expected = Buffer.from(expectedHash, "hex")
  return timingSafeEqual(actual, expected)
}

export function parseTelegramPairingMessage(update: unknown): TelegramPairingMessage | null {
  if (typeof update !== "object" || update === null || !("message" in update)) return null
  const message = update.message
  if (typeof message !== "object" || message === null || !("chat" in message) || !("text" in message)) return null
  const chat = message.chat
  const text = message.text
  if (
    typeof chat !== "object" ||
    chat === null ||
    !("id" in chat) ||
    !("type" in chat) ||
    chat.type !== "private" ||
    (typeof chat.id !== "string" && typeof chat.id !== "number") ||
    typeof text !== "string"
  ) {
    return null
  }
  const match = text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{16,128})$/)
  if (!match) return null
  return { chatId: String(chat.id), code: match[1] }
}
