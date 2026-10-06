import { describe, expect, it, vi } from "vitest"
import { sendTelegramMessage } from "./telegram-client"

describe("Telegram bot client", () => {
  it("sends a plain message to the configured separate chat", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await sendTelegramMessage("new-bot-token", "new-chat-id", "Recordatorio", fetcher)

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/botnew-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "new-chat-id", text: "Recordatorio", disable_web_page_preview: true }),
      }),
    )
  })

  it("surfaces Telegram API errors without exposing the bot token", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "Chat not found" }), { status: 400 }))

    await expect(sendTelegramMessage("secret-token", "missing-chat", "Recordatorio", fetcher)).rejects.toThrow(
      "Chat not found",
    )
  })
})
