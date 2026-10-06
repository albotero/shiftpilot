import { randomBytes } from "node:crypto"
import { prisma } from "@/server/db"
import {
  createTelegramStartUrl,
  hashTelegramPairingCode,
  normalizeTelegramBotUsername,
} from "@/lib/notifications/telegram-pairing"

export const dynamic = "force-dynamic"

const CHAT_KEY = "telegram.chat"
const PAIRING_KEY = "telegram.pairing"
const PAIRING_LIFETIME_MS = 15 * 60_000

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function configuredBot() {
  const username = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME ?? "")
  const configured = process.env.TELEGRAM_BOT_CONFIGURED === "true" && Boolean(username)
  return { configured, username }
}

export async function GET() {
  try {
    const [chatSetting, pairingSetting] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: CHAT_KEY }, select: { value: true } }),
      prisma.appSetting.findUnique({ where: { key: PAIRING_KEY }, select: { value: true } }),
    ])
    const chat = recordValue(chatSetting?.value)
    const pairing = recordValue(pairingSetting?.value)
    const { configured, username } = configuredBot()
    return Response.json({
      linked: typeof chat?.chatId === "string",
      configured,
      botUsername: username || null,
      pairingExpiresAt: typeof pairing?.expiresAt === "string" ? pairing.expiresAt : null,
    })
  } catch {
    return Response.json({ error: "No se pudo consultar el vínculo de Telegram" }, { status: 503 })
  }
}

export async function POST() {
  const { configured, username } = configuredBot()
  if (!configured) {
    return Response.json(
      { error: "Configura TELEGRAM_BOT_TOKEN y TELEGRAM_BOT_USERNAME en el servidor" },
      { status: 503 },
    )
  }

  const code = randomBytes(24).toString("base64url")
  const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS)
  try {
    await prisma.appSetting.upsert({
      where: { key: PAIRING_KEY },
      create: {
        key: PAIRING_KEY,
        value: { codeHash: hashTelegramPairingCode(code), expiresAt: expiresAt.toISOString() },
      },
      update: { value: { codeHash: hashTelegramPairingCode(code), expiresAt: expiresAt.toISOString() } },
    })
    return Response.json({
      startUrl: createTelegramStartUrl(username, code),
      expiresAt: expiresAt.toISOString(),
      botUsername: username,
    })
  } catch {
    return Response.json({ error: "No se pudo generar el enlace de Telegram" }, { status: 503 })
  }
}

export async function DELETE() {
  try {
    await prisma.appSetting.deleteMany({ where: { key: { in: [CHAT_KEY, PAIRING_KEY] } } })
    return Response.json({ linked: false })
  } catch {
    return Response.json({ error: "No se pudo desvincular Telegram" }, { status: 503 })
  }
}
