"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Link2, Unlink } from "lucide-react"

type TelegramConnection = {
  configured: boolean
  linked: boolean
  botUsername: string | null
  pairingExpiresAt: string | null
}

type PairingLink = { startUrl: string; expiresAt: string; botUsername: string }

async function getConnection() {
  const response = await fetch("/api/telegram/connection", { cache: "no-store" })
  const result = (await response.json()) as TelegramConnection & { error?: string }
  if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el vínculo de Telegram.")
  return result
}

export function TelegramConnectionCard() {
  const [connection, setConnection] = useState<TelegramConnection | null>(null)
  const [pairingUrl, setPairingUrl] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    getConnection()
      .then((result) => {
        if (active) setConnection(result)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo consultar Telegram.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!pairingUrl || connection?.linked) return
    let active = true
    const poll = async () => {
      try {
        const result = await getConnection()
        if (active) {
          setConnection(result)
          if (result.linked) {
            setPairingUrl("")
            setMessage("Telegram quedó vinculado.")
          }
        }
      } catch {
        // Keep the pairing link available while the connection is temporarily unavailable.
      }
    }
    const interval = window.setInterval(() => void poll(), 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [pairingUrl, connection?.linked])

  async function createPairingLink() {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/telegram/connection", { method: "POST" })
      const result = (await response.json()) as PairingLink & { error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo generar el enlace.")
      setPairingUrl(result.startUrl)
      setConnection((current) =>
        current ? { ...current, pairingExpiresAt: result.expiresAt, botUsername: result.botUsername } : current,
      )
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo generar el enlace.")
    } finally {
      setSaving(false)
    }
  }

  async function unlinkTelegram() {
    if (!window.confirm("¿Desvincular el chat de Telegram? Dejarás de recibir recordatorios por ese bot.")) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/telegram/connection", { method: "DELETE" })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo desvincular Telegram.")
      setConnection((current) => (current ? { ...current, linked: false, pairingExpiresAt: null } : current))
      setPairingUrl("")
      setMessage("Telegram fue desvinculado.")
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : "No se pudo desvincular Telegram.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="annual-plan-panel" aria-labelledby="telegram-connection-title">
      <div className="annual-plan-heading">
        <span className="annual-plan-icon">
          <Link2 size={18} />
        </span>
        <div>
          <p className="eyebrow">Avisos personales</p>
          <h2 id="telegram-connection-title">Telegram para recordatorios</h2>
        </div>
      </div>
      {loading ? (
        <p className="annual-plan-help">Consultando vínculo…</p>
      ) : connection?.linked ? (
        <div className="telegram-connection-status">
          <p className="annual-plan-message" role="status">
            Telegram conectado{connection.botUsername ? ` · @${connection.botUsername}` : ""}
          </p>
          <button type="button" className="delete-button" onClick={() => void unlinkTelegram()} disabled={saving}>
            <Unlink size={14} /> Desvincular chat
          </button>
        </div>
      ) : (
        <div className="quick-add-form">
          {!connection?.configured ? (
            <p className="annual-plan-help">
              El administrador debe configurar el token y username del bot en el servidor.
            </p>
          ) : (
            <>
              <p className="annual-plan-help">
                {connection.botUsername ? `Bot: @${connection.botUsername}. ` : ""}
                Vincula el chat privado que recibirá los recordatorios.
              </p>
              {!pairingUrl ? (
                <button
                  type="button"
                  className="submit-button telegram-pairing-button"
                  onClick={() => void createPairingLink()}
                  disabled={saving}
                >
                  <Link2 size={15} /> Generar enlace de Telegram
                </button>
              ) : (
                <div className="telegram-pairing-link">
                  <a className="submit-button telegram-open-link" href={pairingUrl} target="_blank" rel="noreferrer">
                    Abrir Telegram y pulsar Iniciar <ExternalLink size={14} />
                  </a>
                  <span className="annual-plan-help">
                    Enlace temporal · vence{" "}
                    {new Date(connection.pairingExpiresAt ?? "").toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {message && (
        <p className="annual-plan-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
