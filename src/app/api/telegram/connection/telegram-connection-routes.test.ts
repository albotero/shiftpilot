import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { hashTelegramPairingCode } from "@/lib/notifications/telegram-pairing"

const prismaMock = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}))

vi.mock("@/server/db", () => ({ prisma: prismaMock }))

import { DELETE, GET, POST } from "./route"

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("TELEGRAM_BOT_CONFIGURED", "true")
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "@ShiftPilotTestBot")
  prismaMock.appSetting.findUnique.mockResolvedValue(null)
  prismaMock.appSetting.upsert.mockResolvedValue({})
  prismaMock.appSetting.deleteMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Telegram connection routes", () => {
  it("reports bot configuration and whether a private chat is linked", async () => {
    prismaMock.appSetting.findUnique
      .mockResolvedValueOnce({ value: { chatId: "123456" } })
      .mockResolvedValueOnce({ value: null })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      configured: true,
      linked: true,
      botUsername: "ShiftPilotTestBot",
      pairingExpiresAt: null,
    })
  })

  it("creates a temporary start link using the bot username and stores only its hash", async () => {
    const response = await POST()
    const result = await response.json()
    const startUrl = new URL(result.startUrl)
    const code = startUrl.searchParams.get("start")

    expect(response.status).toBe(200)
    expect(startUrl.origin + startUrl.pathname).toBe("https://t.me/ShiftPilotTestBot")
    expect(code).toBeTruthy()
    expect(result.botUsername).toBe("ShiftPilotTestBot")
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now())
    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "telegram.pairing" },
      create: {
        key: "telegram.pairing",
        value: expect.objectContaining({ codeHash: hashTelegramPairingCode(code!), expiresAt: result.expiresAt }),
      },
      update: {
        value: expect.objectContaining({ codeHash: hashTelegramPairingCode(code!), expiresAt: result.expiresAt }),
      },
    })
  })

  it("requires only the dedicated bot token and username to create a pairing link", async () => {
    vi.stubEnv("TELEGRAM_BOT_CONFIGURED", "")
    const response = await POST()

    expect(response.status).toBe(503)
    expect(prismaMock.appSetting.upsert).not.toHaveBeenCalled()
  })

  it("unlinks the single chat and any pending pairing code", async () => {
    const response = await DELETE()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ linked: false })
    expect(prismaMock.appSetting.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["telegram.chat", "telegram.pairing"] } },
    })
  })
})
