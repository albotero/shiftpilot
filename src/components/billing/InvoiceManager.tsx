"use client"

import { useEffect, useState, type FormEvent } from "react"
import { FilePlus2, Pencil, Plus, Trash2, X } from "lucide-react"
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from "@/lib/billing/calculations"
import {
  calculateInvoiceAmounts,
  getExpectedPaymentDate,
  invoiceMutationSchema,
  type InvoiceMutation,
} from "@/lib/billing/invoice-service"

type InvoiceType = InvoiceMutation["type"]
type InvoiceStatus = InvoiceMutation["status"]
type InvoiceItem = InvoiceMutation["items"][number]

type InvoiceRecord = {
  id: string
  type: InvoiceType
  serviceDate: string
  invoiceDate: string | null
  expectedPaymentDate: string | null
  grossAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  netAmount: number
  privateShiftCount: number
  privateShiftAmount: number
  status: InvoiceStatus
  paidAt: string | null
  notes: string | null
  items: (InvoiceItem & { id: string })[]
}

type InvoiceSummary = { count: number; netAmount: number }
type InvoiceResponse = {
  invoices: InvoiceRecord[]
  calculationSettings: BillingSettings
  paymentDays: Record<InvoiceType, number>
  summary: InvoiceSummary
}
type ItemDraft = { key: string; description: string; quantity: string; unitAmount: string }

const typeLabels: Record<InvoiceType, string> = {
  SOMA_POS: "Soma POS",
  SOMA_PREPAGADA: "Soma prepagada",
  SOMA_PARTICULAR: "Soma particular",
  SEDARTE: "Sedarte",
}

const statusLabels: Record<InvoiceStatus, string> = {
  PENDIENTE: "Pendiente",
  FACTURADA: "Facturada",
  POR_COBRAR: "Por cobrar",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
}

function createItem(): ItemDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`,
    description: "",
    quantity: "1",
    unitAmount: "",
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount)
}

function formatDate(date: string | null) {
  if (!date) return "—"
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback
}

export function InvoiceManager({
  month,
  onSummaryChange,
}: {
  month: string
  onSummaryChange: (summary: InvoiceSummary) => void
}) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [calculationSettings, setCalculationSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS)
  const [paymentDays, setPaymentDays] = useState<Record<InvoiceType, number>>({
    SOMA_POS: 90,
    SOMA_PREPAGADA: 60,
    SOMA_PARTICULAR: 30,
    SEDARTE: 0,
  })
  const [loadedMonth, setLoadedMonth] = useState("")
  const [refreshToken, setRefreshToken] = useState(0)
  const [type, setType] = useState<InvoiceType>("SOMA_POS")
  const [status, setStatus] = useState<InvoiceStatus>("PENDIENTE")
  const [serviceDate, setServiceDate] = useState(`${month}-01`)
  const [invoiceDate, setInvoiceDate] = useState("")
  const [paidAt, setPaidAt] = useState("")
  const [shiftDiscountAmount, setShiftDiscountAmount] = useState("0")
  const [privateShiftCount, setPrivateShiftCount] = useState("0")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([createItem()])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/invoices?month=${month}&includeMeta=true`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudieron consultar las facturas.")
        if (!active) return
        const data = result as InvoiceResponse
        setInvoices(data.invoices)
        setCalculationSettings(data.calculationSettings)
        setPaymentDays(data.paymentDays)
        onSummaryChange(data.summary)
        setLoadedMonth(month)
      })
      .catch((loadError) => {
        if (active) {
          setError(errorMessage(loadError, "No se pudieron consultar las facturas."))
          setLoadedMonth(month)
        }
      })
    return () => {
      active = false
    }
  }, [month, onSummaryChange, refreshToken])

  const payload = {
    ...(editingId ? { id: editingId } : {}),
    type,
    serviceDate,
    invoiceDate: invoiceDate || null,
    status,
    paidAt: status === "PAGADA" ? paidAt || null : null,
    shiftDiscountAmount: type === "SOMA_POS" ? Number(shiftDiscountAmount) : 0,
    privateShiftCount: type === "SOMA_PARTICULAR" ? Number(privateShiftCount) : 0,
    notes: notes.trim(),
    items: items.map(({ description, quantity, unitAmount }) => ({
      description,
      quantity: Number(quantity),
      unitAmount: Number(unitAmount),
    })),
  }
  const parsedDraft = invoiceMutationSchema.safeParse(payload)
  let preview: ReturnType<typeof calculateInvoiceAmounts> | null = null
  if (parsedDraft.success) {
    try {
      preview = calculateInvoiceAmounts(parsedDraft.data, calculationSettings)
    } catch {
      preview = null
    }
  }
  const expectedPaymentDate = parsedDraft.success
    ? getExpectedPaymentDate(serviceDate, invoiceDate || null, paymentDays[type])
    : null

  function resetForm() {
    setType("SOMA_POS")
    setStatus("PENDIENTE")
    setServiceDate(`${month}-01`)
    setInvoiceDate("")
    setPaidAt("")
    setShiftDiscountAmount("0")
    setPrivateShiftCount("0")
    setNotes("")
    setItems([createItem()])
    setEditingId(null)
  }

  function editInvoice(invoice: InvoiceRecord) {
    setEditingId(invoice.id)
    setType(invoice.type)
    setStatus(invoice.status)
    setServiceDate(invoice.serviceDate)
    setInvoiceDate(invoice.invoiceDate ?? "")
    setPaidAt(invoice.paidAt ?? "")
    setShiftDiscountAmount(String(invoice.shiftDiscountAmount))
    setPrivateShiftCount(String(invoice.privateShiftCount))
    setNotes(invoice.notes ?? "")
    setItems(
      invoice.items.map((item) => ({
        key: item.id,
        description: item.description,
        quantity: String(item.quantity),
        unitAmount: String(item.unitAmount),
      })),
    )
    setError("")
    setMessage("")
  }

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = invoiceMutationSchema.safeParse(payload)
    if (!parsed.success) {
      setError("Revisa fechas, partidas, descuentos y estado de pago.")
      return
    }
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la factura.")
      setMessage(editingId ? "Factura actualizada." : "Factura creada.")
      resetForm()
      setRefreshToken((value) => value + 1)
    } catch (saveError) {
      setError(errorMessage(saveError, "No se pudo guardar la factura."))
    } finally {
      setSaving(false)
    }
  }

  async function deleteInvoice(invoice: InvoiceRecord) {
    if (!window.confirm("¿Eliminar esta factura y sus partidas?")) return
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoice.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar la factura.")
      if (editingId === invoice.id) resetForm()
      setMessage("Factura eliminada.")
      setRefreshToken((value) => value + 1)
    } catch (deleteError) {
      setError(errorMessage(deleteError, "No se pudo eliminar la factura."))
    }
  }

  return (
    <section className="invoice-manager" id="invoices" aria-labelledby="invoice-manager-title">
      <div className="invoice-manager-heading">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h2 id="invoice-manager-title">Facturas · {month}</h2>
        </div>
        <span className="invoice-month-total">
          {formatAmount(invoices.reduce((total, invoice) => total + invoice.netAmount, 0))} miles COP
        </span>
      </div>

      <form className="invoice-form" onSubmit={saveInvoice}>
        <div className="invoice-form-grid">
          <label className="form-field">
            <span>Tipo de factura</span>
            <select value={type} onChange={(event) => setType(event.target.value as InvoiceType)}>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Fecha de servicio</span>
            <input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Fecha de factura · opcional</span>
            <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => {
                const nextStatus = event.target.value as InvoiceStatus
                setStatus(nextStatus)
                if (nextStatus !== "PAGADA") setPaidAt("")
              }}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {status === "PAGADA" && (
            <label className="form-field">
              <span>Fecha de pago</span>
              <input type="date" required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
          )}
          {type === "SOMA_POS" && (
            <label className="form-field">
              <span>Descuento de turnos · miles COP</span>
              <input
                type="number"
                min="0"
                step="1"
                value={shiftDiscountAmount}
                onChange={(event) => setShiftDiscountAmount(event.target.value)}
              />
            </label>
          )}
          {type === "SOMA_PARTICULAR" && (
            <label className="form-field">
              <span>Turnos particulares</span>
              <input
                type="number"
                min="0"
                step="1"
                value={privateShiftCount}
                onChange={(event) => setPrivateShiftCount(event.target.value)}
              />
            </label>
          )}
        </div>

        <div className="invoice-items-heading">
          <h3>Partidas</h3>
          <button type="button" className="invoice-secondary-button" onClick={() => setItems([...items, createItem()])}>
            <Plus size={14} /> Agregar partida
          </button>
        </div>
        <div className="invoice-item-list">
          {items.map((item, index) => (
            <div className="invoice-item-row" key={item.key}>
              <label className="form-field invoice-item-description">
                <span>Descripción</span>
                <input
                  required
                  maxLength={120}
                  value={item.description}
                  onChange={(event) =>
                    setItems(
                      items.map((current) =>
                        current.key === item.key ? { ...current, description: event.target.value } : current,
                      ),
                    )
                  }
                />
              </label>
              <label className="form-field">
                <span>Cantidad</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  max="999999"
                  step="0.01"
                  value={item.quantity}
                  onChange={(event) =>
                    setItems(
                      items.map((current) =>
                        current.key === item.key ? { ...current, quantity: event.target.value } : current,
                      ),
                    )
                  }
                />
              </label>
              <label className="form-field">
                <span>Valor unitario · miles COP</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={item.unitAmount}
                  onChange={(event) =>
                    setItems(
                      items.map((current) =>
                        current.key === item.key ? { ...current, unitAmount: event.target.value } : current,
                      ),
                    )
                  }
                />
              </label>
              <span className="invoice-item-total">
                {formatAmount(Math.round(Number(item.quantity) * Number(item.unitAmount) || 0))}
              </span>
              <button
                type="button"
                className="icon-button invoice-remove-item"
                aria-label={`Quitar partida ${index + 1}`}
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((current) => current.key !== item.key))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <label className="form-field invoice-notes">
          <span>Notas · opcional</span>
          <textarea maxLength={500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div className="invoice-calculation" aria-live="polite">
          <div>
            <span>Vencimiento estimado</span>
            <strong>{expectedPaymentDate ?? "—"}</strong>
          </div>
          <div>
            <span>Bruto</span>
            <strong>{preview ? formatAmount(preview.grossAmount) : "—"}</strong>
          </div>
          <div>
            <span>Descuentos</span>
            <strong>{preview ? formatAmount(preview.discountAmount + preview.shiftDiscountAmount) : "—"}</strong>
          </div>
          {preview && preview.privateShiftAmount > 0 && (
            <div>
              <span>Turnos particulares</span>
              <strong>{formatAmount(preview.privateShiftAmount)}</strong>
            </div>
          )}
          <div className="invoice-net">
            <span>Neto · miles COP</span>
            <strong>{preview ? formatAmount(preview.netAmount) : "—"}</strong>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="invoice-message" role="status">
            {message}
          </p>
        )}
        <div className="invoice-form-actions">
          {editingId && (
            <button type="button" className="cancel-button" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
          <button type="submit" className="submit-button" disabled={saving}>
            <FilePlus2 size={15} /> {saving ? "Guardando…" : editingId ? "Guardar factura" : "Crear factura"}
          </button>
        </div>
      </form>

      <div className="invoice-table-wrap">
        {loadedMonth !== month ? (
          <p className="invoice-empty">Cargando facturas…</p>
        ) : invoices.length === 0 ? (
          <p className="invoice-empty">No hay facturas para este mes.</p>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Tipo</th>
                <th>Factura / vence</th>
                <th>Estado</th>
                <th className="amount-column">Neto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{formatDate(invoice.serviceDate)}</td>
                  <td>{typeLabels[invoice.type]}</td>
                  <td>
                    {formatDate(invoice.invoiceDate)} / {formatDate(invoice.expectedPaymentDate)}
                  </td>
                  <td>
                    <span className={`invoice-status status-${invoice.status.toLowerCase()}`}>
                      {statusLabels[invoice.status]}
                    </span>
                  </td>
                  <td className="amount-column">{formatAmount(invoice.netAmount)}</td>
                  <td className="invoice-row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Editar ${typeLabels[invoice.type]}`}
                      onClick={() => editInvoice(invoice)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button invoice-delete-button"
                      aria-label={`Eliminar ${typeLabels[invoice.type]}`}
                      onClick={() => void deleteInvoice(invoice)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
