export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  })
  const result = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.description ?? `Telegram respondió HTTP ${response.status}`)
  }
}
