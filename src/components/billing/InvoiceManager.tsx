"use client"

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { FilePlus2, FileUp, Pencil, Plus, Trash2, X } from "lucide-react"
import { DateInput } from "@/components/forms/DateInput"
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from "@/lib/billing/calculations"
import { addMoney, roundMoneyAmount, subtractMoney } from "@/lib/money/integer"
import { extractInvoiceTextFromPdf } from "@/lib/billing/pdf-reader"
import {
  calculateInvoiceAmounts,
  getExpectedPaymentDate,
  invoiceMutationSchema,
  type InvoiceMutation,
} from "@/lib/billing/invoice-service"
import { parseInvoicePdfText } from "@/lib/billing/pdf-import"

type InvoiceType = InvoiceMutation["type"]
type InvoiceStatus = InvoiceMutation["status"]
type InvoiceItem = InvoiceMutation["items"][number]

type InvoiceRecord = {
  id: string
  type: InvoiceType
  serviceDate: string
  invoiceDate: string | null
  invoiceNumber: string | null
  expectedPaymentDate: string | null
  pdfTotalAmount: number | null
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
type ItemDraft = { key: string; description: string; quantity: string; unitAmount: string; discountAmount: string }

const typeLabels: Record<InvoiceType, string> = {
  SOMA_POS: "Soma POS",
  SOMA_PREPAGADA: "Soma prepagada",
  SOMA_PARTICULAR: "Soma particular",
  SEDARTE: "Sedarte",
}

function createItem(): ItemDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`,
    description: "",
    quantity: "1",
    unitAmount: "",
    discountAmount: "0",
  }
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

function formatDate(date: string | null) {
  return date ? format(new Date(`${date}T12:00:00`), "dd MMM. yyyy", { locale: es }) : "—"
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback
}

export function InvoiceManager({
  month,
  onSummaryChange,
  onMonthChange,
  onInvoicesChanged,
}: {
  month: string
  onSummaryChange: (summary: InvoiceSummary) => void
  onMonthChange: (month: string) => void
  onInvoicesChanged: () => void
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
  const [storedStatus, setStoredStatus] = useState<InvoiceStatus>("FACTURADA")
  const [storedPaidAt, setStoredPaidAt] = useState("")
  const [serviceDate, setServiceDate] = useState(`${month}-01`)
  const [invoiceDate, setInvoiceDate] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [expectedPaymentDateOverride, setExpectedPaymentDateOverride] = useState("")
  const [shiftDiscountAmount, setShiftDiscountAmount] = useState("0")
  const [privateShiftCount, setPrivateShiftCount] = useState("0")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([createItem()])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pdfImporting, setPdfImporting] = useState(false)
  const [pdfReportedTotal, setPdfReportedTotal] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const pdfInputRef = useRef<HTMLInputElement>(null)

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

  const effectiveServiceDate = invoiceDate || (editingId ? serviceDate : `${month}-01`)
  const payload = {
    ...(editingId ? { id: editingId } : {}),
    type,
    serviceDate: effectiveServiceDate,
    invoiceDate: invoiceDate || null,
    invoiceNumber: invoiceNumber.trim() || null,
    expectedPaymentDate: expectedPaymentDateOverride || null,
    pdfTotalAmount: pdfReportedTotal,
    status: editingId ? storedStatus : "FACTURADA",
    paidAt: editingId && storedStatus === "PAGADA" ? storedPaidAt || null : null,
    shiftDiscountAmount: type === "SOMA_POS" ? Number(shiftDiscountAmount) : 0,
    privateShiftCount: type === "SOMA_PARTICULAR" ? Number(privateShiftCount) : 0,
    notes: notes.trim(),
    items: items.map(({ description, quantity, unitAmount, discountAmount }) => ({
      description,
      quantity: Number(quantity),
      unitAmount: Number(unitAmount),
      discountAmount: Number(discountAmount),
    })),
  }
  const parsedDraft = invoiceMutationSchema.safeParse(payload)
  let pdfLineTotal: number | null = null
  if (parsedDraft.success) {
    try {
      pdfLineTotal = addMoney(
        ...parsedDraft.data.items.map((item) =>
          subtractMoney(roundMoneyAmount(item.quantity * item.unitAmount), item.discountAmount ?? 0),
        ),
      )
    } catch {
      pdfLineTotal = null
    }
  }
  let preview: ReturnType<typeof calculateInvoiceAmounts> | null = null
  if (parsedDraft.success) {
    try {
      preview = calculateInvoiceAmounts(parsedDraft.data, calculationSettings)
    } catch {
      preview = null
    }
  }
  const expectedPaymentDate = parsedDraft.success
    ? (parsedDraft.data.expectedPaymentDate ??
      getExpectedPaymentDate(effectiveServiceDate, invoiceDate || null, paymentDays[type]))
    : null

  function resetForm() {
    setType("SOMA_POS")
    setStoredStatus("FACTURADA")
    setStoredPaidAt("")
    setServiceDate(`${month}-01`)
    setInvoiceDate("")
    setInvoiceNumber("")
    setExpectedPaymentDateOverride("")
    setShiftDiscountAmount("0")
    setPrivateShiftCount("0")
    setNotes("")
    setItems([createItem()])
    setEditingId(null)
    setPdfReportedTotal(null)
  }

  function editInvoice(invoice: InvoiceRecord) {
    setEditingId(invoice.id)
    setType(invoice.type)
    setStoredStatus(invoice.status)
    setStoredPaidAt(invoice.paidAt ?? "")
    setServiceDate(invoice.serviceDate)
    setInvoiceDate(invoice.invoiceDate ?? "")
    setInvoiceNumber(invoice.invoiceNumber ?? "")
    setExpectedPaymentDateOverride(invoice.expectedPaymentDate ?? "")
    setPdfReportedTotal(invoice.pdfTotalAmount)
    setShiftDiscountAmount(String(invoice.shiftDiscountAmount))
    setPrivateShiftCount(String(invoice.privateShiftCount))
    setNotes(invoice.notes ?? "")
    setItems(
      invoice.items.map((item) => ({
        key: item.id,
        description: item.description,
        quantity: String(item.quantity),
        unitAmount: String(item.unitAmount),
        discountAmount: String(item.discountAmount),
      })),
    )
    setError("")
    setMessage("")
  }

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setPdfImporting(true)
    setError("")
    setMessage("")
    try {
      const imported = parseInvoicePdfText(await extractInvoiceTextFromPdf(file))
      setEditingId(null)
      setInvoiceNumber(imported.invoiceNumber ?? "")
      if (imported.type) setType(imported.type)
      setInvoiceDate(imported.invoiceDate ?? imported.serviceDate ?? "")
      setExpectedPaymentDateOverride(imported.expectedPaymentDate ?? "")
      setServiceDate(imported.serviceDate ?? imported.invoiceDate ?? `${month}-01`)
      setItems(
        imported.items.map((item) => ({
          key: createItem().key,
          description: item.description,
          quantity: String(item.quantity),
          unitAmount: String(item.unitAmount),
          discountAmount: String(item.discountAmount),
        })),
      )
      setShiftDiscountAmount("0")
      setPrivateShiftCount("0")
      setPdfReportedTotal(imported.pdfTotalAmount)
      const serviceMonth = (imported.serviceDate ?? imported.invoiceDate)?.slice(0, 7)
      if (serviceMonth) onMonthChange(serviceMonth)
      setMessage(
        `PDF leído: ${imported.items.length} partida${imported.items.length === 1 ? "" : "s"}. Revisa los datos antes de guardar.`,
      )
    } catch (importError) {
      setError(errorMessage(importError, "No se pudo leer la factura. Usa un PDF con texto seleccionable."))
    } finally {
      setPdfImporting(false)
      input.value = ""
    }
  }

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = invoiceMutationSchema.safeParse(payload)
    if (!parsed.success) {
      setError("Revisa fechas, partidas y descuentos.")
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
      onInvoicesChanged()
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
      onInvoicesChanged()
    } catch (deleteError) {
      setError(errorMessage(deleteError, "No se pudo eliminar la factura."))
    }
  }

  return (
    <section className="invoice-manager" id="invoices" aria-labelledby="invoice-manager-title">
      <div className="invoice-manager-heading">
        <div className="invoice-manager-actions">
          <input
            ref={pdfInputRef}
            aria-label="Seleccionar factura PDF"
            className="invoice-pdf-input"
            type="file"
            accept=".pdf,application/pdf"
            tabIndex={-1}
            aria-hidden="true"
            onChange={importPdf}
          />
          <button
            type="button"
            className="invoice-import-button"
            disabled={pdfImporting}
            onClick={() => pdfInputRef.current?.click()}
          >
            <FileUp size={15} /> {pdfImporting ? "Leyendo PDF…" : "Importar PDF"}
          </button>
        </div>
      </div>

      <form className="invoice-form" onSubmit={saveInvoice}>
        <div className="invoice-form-grid">
          <label className="form-field">
            <span>Número de factura</span>
            <input maxLength={64} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
          </label>
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
          <div className="form-field">
            <label htmlFor="invoice-expedition-date">Expedición</label>
            <DateInput
              id="invoice-expedition-date"
              ariaLabel="Expedición"
              value={invoiceDate}
              onChange={(nextDate) => {
                setInvoiceDate(nextDate)
                if (nextDate) {
                  setServiceDate(nextDate)
                  onMonthChange(nextDate.slice(0, 7))
                } else if (!editingId) {
                  setServiceDate(`${month}-01`)
                }
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="invoice-due-date">Vencimiento · opcional</label>
            <DateInput
              id="invoice-due-date"
              ariaLabel="Vencimiento"
              value={expectedPaymentDateOverride}
              onChange={setExpectedPaymentDateOverride}
            />
          </div>
          {type === "SOMA_POS" && pdfReportedTotal === null && (
            <label className="form-field">
              <span>Descuento de turnos · miles COP</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={shiftDiscountAmount}
                onChange={(event) => setShiftDiscountAmount(event.target.value)}
              />
            </label>
          )}
          {type === "SOMA_PARTICULAR" && pdfReportedTotal === null && (
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
            <div
              className={`invoice-item-row ${Number(item.discountAmount) > 0 ? "has-line-discount" : ""}`}
              key={item.key}
            >
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
                  step="0.001"
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
              {Number(item.discountAmount) > 0 && (
                <label className="form-field invoice-item-discount">
                  <span>Descuento · miles COP</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.discountAmount}
                    onChange={(event) =>
                      setItems(
                        items.map((current) =>
                          current.key === item.key ? { ...current, discountAmount: event.target.value } : current,
                        ),
                      )
                    }
                  />
                </label>
              )}
              <span className="invoice-item-total">
                {formatAmount(roundMoneyAmount(Number(item.quantity) * Number(item.unitAmount) || 0))}
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
            <strong>
              {preview ? formatAmount(addMoney(preview.discountAmount, preview.shiftDiscountAmount)) : "—"}
            </strong>
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

        {pdfReportedTotal !== null && pdfLineTotal !== null && pdfLineTotal !== pdfReportedTotal && (
          <p className="invoice-pdf-warning" role="status">
            Las partidas suman {formatAmount(pdfLineTotal)} miles COP, pero el PDF indica{" "}
            {formatAmount(pdfReportedTotal)}. Revisa las partidas y el total importado.
          </p>
        )}

        {pdfReportedTotal !== null && (
          <label className="form-field pdf-total-field">
            <span>Total a pagar del PDF · miles COP</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={pdfReportedTotal}
              onChange={(event) => setPdfReportedTotal(event.target.value === "" ? null : Number(event.target.value))}
            />
          </label>
        )}

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
                <th>Factura</th>
                <th>Institución o unidad</th>
                <th>Factura / vence</th>
                <th className="amount-column">Neto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber ?? "—"}</td>
                  <td>{typeLabels[invoice.type]}</td>
                  <td>
                    {formatDate(invoice.invoiceDate)} / {formatDate(invoice.expectedPaymentDate)}
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
