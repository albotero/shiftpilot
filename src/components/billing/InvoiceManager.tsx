"use client"

import { Fragment, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { FilePlus2, FileUp, Pencil, Plus, Save, Trash2, X } from "lucide-react"
import { DateInput } from "@/components/forms/DateInput"
import { MoneyInput } from "@/components/forms/MoneyInput"
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from "@/lib/billing/calculations"
import { addMoney, roundMoneyAmount, subtractMoney } from "@/lib/money/integer"
import { extractInvoiceTextFromPdf } from "@/lib/billing/pdf-reader"
import {
  calculateInvoiceAmounts,
  getExpectedPaymentDate,
  invoiceMutationSchema,
  type InvoiceMutation,
} from "@/lib/billing/invoice-service"
import { parseCreditNotePdfText, parseInvoicePdfText, type ImportedCreditNote } from "@/lib/billing/pdf-import"
import { isInstitutionIncludedInIbc } from "@/lib/billing/ibc-institutions"
import { normalizeInvoiceNumber } from "@/lib/billing/invoice-identifiers"

type InvoiceType = InvoiceMutation["type"]
type InvoiceStatus = InvoiceMutation["status"]
type InvoiceItem = InvoiceMutation["items"][number]

type InvoiceRecord = {
  id: string
  type: InvoiceType
  serviceDate: string
  invoiceDate: string | null
  invoiceNumber: string | null
  institutionName: string | null
  expectedPaymentDate: string | null
  pdfTotalAmount: number | null
  grossAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  includeInIbc: boolean
  netAmount: number
  privateShiftCount: number
  privateShiftAmount: number
  status: InvoiceStatus
  paidAt: string | null
  notes: string | null
  creditNotes: {
    number: string
    date: string | null
    reason: string
    amount: number
    action: "ANULACION" | "MODIFICACION"
    resultingAmount?: number
  }[]
  items: (InvoiceItem & { id: string })[]
}

type InvoiceSummary = { count: number; netAmount: number }
type CreditNoteDraft = {
  invoiceId: string | null
  originalInvoiceNumber: string
  creditNoteNumber: string
  creditNoteDate: string
  reason: string
  amount: string
}
type InvoiceResponse = {
  invoices: InvoiceRecord[]
  calculationSettings: BillingSettings
  paymentDays: Record<InvoiceType, number>
  includedIbcInstitutions: string[]
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
  const [institutionName, setInstitutionName] = useState("")
  const [knownInstitutions, setKnownInstitutions] = useState<string[]>([])
  const [includedIbcInstitutions, setIncludedIbcInstitutions] = useState<string[]>([])
  const [expectedPaymentDateOverride, setExpectedPaymentDateOverride] = useState("")
  const [shiftDiscountAmount, setShiftDiscountAmount] = useState("0")
  const [includeInIbc, setIncludeInIbc] = useState(false)
  const [includeInIbcManuallySet, setIncludeInIbcManuallySet] = useState(false)
  const [privateShiftCount, setPrivateShiftCount] = useState("0")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ItemDraft[]>([createItem()])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingIbcId, setSavingIbcId] = useState<string | null>(null)
  const [pdfImporting, setPdfImporting] = useState(false)
  const [pdfReportedTotal, setPdfReportedTotal] = useState<number | null>(null)
  const [pendingCreditNote, setPendingCreditNote] = useState<ImportedCreditNote | null>(null)
  const [applyingCreditNote, setApplyingCreditNote] = useState(false)
  const [creditNoteDraft, setCreditNoteDraft] = useState<CreditNoteDraft | null>(null)
  const [savingCreditNote, setSavingCreditNote] = useState(false)
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
        setIncludedIbcInstitutions(data.includedIbcInstitutions ?? [])
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

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/invoices/ibc-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as { institutions?: string[]; includedInstitutions?: string[] }
        if (!response.ok || controller.signal.aborted) return
        setKnownInstitutions(result.institutions ?? [])
        setIncludedIbcInstitutions(result.includedInstitutions ?? [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [refreshToken])

  const effectiveServiceDate = invoiceDate || (editingId ? serviceDate : `${month}-01`)
  const payload = {
    ...(editingId ? { id: editingId } : {}),
    type,
    serviceDate: effectiveServiceDate,
    invoiceDate: invoiceDate || null,
    invoiceNumber: invoiceNumber.trim() || null,
    institutionName: institutionName.trim() || null,
    expectedPaymentDate: expectedPaymentDateOverride || null,
    pdfTotalAmount: pdfReportedTotal,
    status: editingId ? storedStatus : "FACTURADA",
    includeInIbc: editingId || includeInIbcManuallySet ? includeInIbc : undefined,
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
    setInstitutionName("")
    setExpectedPaymentDateOverride("")
    setShiftDiscountAmount("0")
    setIncludeInIbc(false)
    setIncludeInIbcManuallySet(false)
    setPrivateShiftCount("0")
    setNotes("")
    setItems([createItem()])
    setEditingId(null)
    setPdfReportedTotal(null)
    setPendingCreditNote(null)
  }

  function editInvoice(invoice: InvoiceRecord) {
    setEditingId(invoice.id)
    setType(invoice.type)
    setStoredStatus(invoice.status)
    setStoredPaidAt(invoice.paidAt ?? "")
    setServiceDate(invoice.serviceDate)
    setInvoiceDate(invoice.invoiceDate ?? "")
    setInvoiceNumber(invoice.invoiceNumber ?? "")
    setInstitutionName(invoice.institutionName ?? "")
    setExpectedPaymentDateOverride(invoice.expectedPaymentDate ?? "")
    setPdfReportedTotal(invoice.pdfTotalAmount)
    setIncludeInIbc(invoice.includeInIbc)
    setIncludeInIbcManuallySet(true)
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
    setPendingCreditNote(null)
  }

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setPdfImporting(true)
    setError("")
    setMessage("")
    try {
      const extractedText = await extractInvoiceTextFromPdf(file)
      const creditNote = parseCreditNotePdfText(extractedText)
      if (creditNote) {
        setPendingCreditNote(creditNote)
        setMessage(
          `Nota crédito ${creditNote.creditNoteNumber} lista para asociar a la factura ${creditNote.originalInvoiceNumber}.`,
        )
        return
      }
      const imported = parseInvoicePdfText(extractedText)
      let existingInvoice: InvoiceRecord | undefined
      if (imported.invoiceNumber) {
        const response = await fetch(`/api/invoices?number=${encodeURIComponent(imported.invoiceNumber)}`, {
          cache: "no-store",
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo comprobar si la factura ya existe.")
        existingInvoice = (result as InvoiceRecord[]).find(
          (invoice) =>
            normalizeInvoiceNumber(invoice.invoiceNumber ?? "") === normalizeInvoiceNumber(imported.invoiceNumber!),
        )
      }
      setEditingId(existingInvoice?.id ?? null)
      setStoredStatus(existingInvoice?.status ?? "FACTURADA")
      setStoredPaidAt(existingInvoice?.paidAt ?? "")
      setPendingCreditNote(null)
      setInstitutionName(imported.institutionName ?? existingInvoice?.institutionName ?? "")
      setIncludeInIbc(
        existingInvoice?.includeInIbc ?? isInstitutionIncludedInIbc(imported.institutionName, includedIbcInstitutions),
      )
      setIncludeInIbcManuallySet(Boolean(existingInvoice))
      setInvoiceNumber(imported.invoiceNumber ?? existingInvoice?.invoiceNumber ?? "")
      setType(imported.type ?? existingInvoice?.type ?? "SOMA_POS")
      setInvoiceDate(imported.invoiceDate ?? imported.serviceDate ?? existingInvoice?.invoiceDate ?? "")
      setExpectedPaymentDateOverride(imported.expectedPaymentDate ?? existingInvoice?.expectedPaymentDate ?? "")
      setServiceDate(imported.serviceDate ?? imported.invoiceDate ?? existingInvoice?.serviceDate ?? `${month}-01`)
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
      setPrivateShiftCount(String(existingInvoice?.privateShiftCount ?? 0))
      setNotes(existingInvoice?.notes ?? "")
      setPdfReportedTotal(imported.pdfTotalAmount)
      const serviceMonth = (imported.serviceDate ?? imported.invoiceDate)?.slice(0, 7)
      if (serviceMonth) onMonthChange(serviceMonth)
      setMessage(
        existingInvoice
          ? `Factura ${existingInvoice.invoiceNumber} encontrada. Revisa los datos y guarda para actualizarla.`
          : `PDF leído: ${imported.items.length} partida${imported.items.length === 1 ? "" : "s"}. Revisa los datos antes de guardar.`,
      )
    } catch (importError) {
      setError(errorMessage(importError, "No se pudo leer la factura. Usa un PDF con texto seleccionable."))
    } finally {
      setPdfImporting(false)
      input.value = ""
    }
  }

  async function applyCreditNote() {
    if (!pendingCreditNote) return
    setApplyingCreditNote(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices/credit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingCreditNote),
      })
      const result = (await response.json()) as { serviceDate?: string; action?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo aplicar la nota crédito.")
      setPendingCreditNote(null)
      setMessage(
        result.action === "ANULACION"
          ? "Factura anulada; la nota crédito quedó registrada."
          : "Factura modificada; la nota crédito quedó registrada sin alterar sus valores.",
      )
      if (result.serviceDate) onMonthChange(result.serviceDate.slice(0, 7))
      setRefreshToken((value) => value + 1)
      onInvoicesChanged()
    } catch (applyError) {
      setError(errorMessage(applyError, "No se pudo aplicar la nota crédito."))
    } finally {
      setApplyingCreditNote(false)
    }
  }

  function startNewCreditNote() {
    setError("")
    setMessage("")
    setCreditNoteDraft({
      invoiceId: null,
      originalInvoiceNumber: "",
      creditNoteNumber: "",
      creditNoteDate: format(new Date(), "yyyy-MM-dd"),
      reason: "",
      amount: "",
    })
  }

  function editCreditNote(invoice: InvoiceRecord, note: InvoiceRecord["creditNotes"][number]) {
    setError("")
    setMessage("")
    setCreditNoteDraft({
      invoiceId: invoice.id,
      originalInvoiceNumber: invoice.invoiceNumber ?? "",
      creditNoteNumber: note.number,
      creditNoteDate: note.date ?? "",
      reason: note.reason,
      amount: String(note.amount),
    })
  }

  async function saveCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!creditNoteDraft) return
    const amount = Number(creditNoteDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 1000 - Math.round(amount * 1000)) >= 0.000001) {
      setError("Indica un valor positivo con máximo tres decimales en miles COP.")
      return
    }
    setSavingCreditNote(true)
    setError("")
    setMessage("")
    try {
      const editing = creditNoteDraft.invoiceId !== null
      const response = await fetch("/api/invoices/credit-note", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing
            ? { invoiceId: creditNoteDraft.invoiceId }
            : { originalInvoiceNumber: creditNoteDraft.originalInvoiceNumber }),
          creditNoteNumber: creditNoteDraft.creditNoteNumber,
          creditNoteDate: creditNoteDraft.creditNoteDate || null,
          reason: creditNoteDraft.reason,
          amount,
        }),
      })
      const result = (await response.json()) as { serviceDate?: string; action?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la nota crédito.")
      setCreditNoteDraft(null)
      setMessage(
        result.action === "ANULACION"
          ? "Factura anulada; la nota crédito quedó registrada."
          : editing
            ? "Nota crédito modificada y factura recalculada."
            : "Nota crédito creada y asociada a la factura.",
      )
      if (result.serviceDate) onMonthChange(result.serviceDate.slice(0, 7))
      setRefreshToken((value) => value + 1)
      onInvoicesChanged()
    } catch (saveError) {
      setError(errorMessage(saveError, "No se pudo guardar la nota crédito."))
    } finally {
      setSavingCreditNote(false)
    }
  }

  async function deleteCreditNote(invoice: InvoiceRecord, note: InvoiceRecord["creditNotes"][number]) {
    if (!window.confirm(`¿Eliminar la nota crédito ${note.number} y recalcular la factura?`)) return
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices/credit-note", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, creditNoteNumber: note.number }),
      })
      const result = (await response.json()) as { serviceDate?: string; status?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar la nota crédito.")
      setMessage(
        result.status === "ANULADA"
          ? "Nota eliminada; la factura sigue anulada."
          : "Nota eliminada y factura recalculada.",
      )
      if (result.serviceDate) onMonthChange(result.serviceDate.slice(0, 7))
      setRefreshToken((value) => value + 1)
      onInvoicesChanged()
    } catch (deleteError) {
      setError(errorMessage(deleteError, "No se pudo eliminar la nota crédito."))
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

  async function toggleInvoiceIbc(invoice: InvoiceRecord) {
    setSavingIbcId(invoice.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoice.id, includeInIbc: !invoice.includeInIbc }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la inclusión en el IBC.")
      const updatedInvoice = result as InvoiceRecord
      setInvoices((current) => current.map((item) => (item.id === updatedInvoice.id ? updatedInvoice : item)))
      if (editingId === invoice.id) setIncludeInIbc(updatedInvoice.includeInIbc)
      setMessage(
        updatedInvoice.includeInIbc
          ? "La factura se incluirá en el cálculo del IBC."
          : "La factura se excluyó del cálculo del IBC.",
      )
      onInvoicesChanged()
    } catch (toggleError) {
      setError(errorMessage(toggleError, "No se pudo actualizar la inclusión en el IBC."))
    } finally {
      setSavingIbcId(null)
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
          <button type="button" className="invoice-secondary-button" onClick={startNewCreditNote}>
            <Plus size={14} /> Nueva nota crédito
          </button>
        </div>
      </div>

      {creditNoteDraft && (
        <form className="manual-credit-note-form" onSubmit={saveCreditNote}>
          <div className="manual-credit-note-heading">
            <div>
              <p className="eyebrow">Ajuste de facturación</p>
              <h3>
                {creditNoteDraft.invoiceId ? `Editar nota ${creditNoteDraft.creditNoteNumber}` : "Nueva nota crédito"}
              </h3>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar formulario de nota crédito"
              disabled={savingCreditNote}
              onClick={() => setCreditNoteDraft(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="manual-credit-note-fields">
            <label className="form-field">
              <span>Factura original</span>
              <input
                required
                maxLength={64}
                value={creditNoteDraft.originalInvoiceNumber}
                disabled={creditNoteDraft.invoiceId !== null}
                onChange={(event) =>
                  setCreditNoteDraft((current) => current && { ...current, originalInvoiceNumber: event.target.value })
                }
                placeholder="Ej. SF-181"
              />
            </label>
            <label className="form-field">
              <span>Número de nota crédito</span>
              <input
                required
                maxLength={64}
                value={creditNoteDraft.creditNoteNumber}
                disabled={creditNoteDraft.invoiceId !== null}
                onChange={(event) =>
                  setCreditNoteDraft((current) => current && { ...current, creditNoteNumber: event.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Fecha</span>
              <input
                type="date"
                value={creditNoteDraft.creditNoteDate}
                onChange={(event) =>
                  setCreditNoteDraft((current) => current && { ...current, creditNoteDate: event.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Valor · miles COP</span>
              <MoneyInput
                required
                value={creditNoteDraft.amount}
                onValueChange={(amount) => setCreditNoteDraft((current) => current && { ...current, amount })}
              />
            </label>
            <label className="form-field manual-credit-note-reason">
              <span>Observación · opcional</span>
              <input
                maxLength={400}
                value={creditNoteDraft.reason}
                onChange={(event) =>
                  setCreditNoteDraft((current) => current && { ...current, reason: event.target.value })
                }
                placeholder="Motivo o cambio realizado"
              />
            </label>
          </div>
          <div className="manual-credit-note-footer">
            <p>Si el valor coincide con el neto pendiente, la factura se anula; si es parcial, se modifica.</p>
            <div className="invoice-form-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setCreditNoteDraft(null)}
                disabled={savingCreditNote}
              >
                Cancelar
              </button>
              <button type="submit" className="submit-button" disabled={savingCreditNote}>
                <Save size={15} />{" "}
                {savingCreditNote ? "Guardando…" : creditNoteDraft.invoiceId ? "Guardar nota" : "Crear nota crédito"}
              </button>
            </div>
          </div>
        </form>
      )}

      {pendingCreditNote && (
        <div className="invoice-credit-note-notice" role="status">
          <div>
            <strong>Nota crédito {pendingCreditNote.creditNoteNumber}</strong>
            <span>
              Factura {pendingCreditNote.originalInvoiceNumber} · {pendingCreditNote.reason || "Sin observación"} ·{" "}
              {formatAmount(pendingCreditNote.amount)} mil COP
            </span>
            <small>Se anulará si su valor coincide con el neto original; si difiere, quedará como modificación.</small>
          </div>
          <button
            type="button"
            className="submit-button"
            onClick={() => void applyCreditNote()}
            disabled={applyingCreditNote}
          >
            {applyingCreditNote ? "Aplicando…" : "Aplicar nota crédito"}
          </button>
        </div>
      )}

      <form className="invoice-form" onSubmit={saveInvoice}>
        <div className="invoice-form-grid">
          <label className="form-field">
            <span>Número de factura</span>
            <input maxLength={64} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Entidad</span>
            <input
              list="invoice-institution-options"
              autoComplete="off"
              maxLength={160}
              required
              value={institutionName}
              onChange={(event) => {
                const nextName = event.target.value
                setInstitutionName(nextName)
                if (!editingId) {
                  setIncludeInIbc(isInstitutionIncludedInIbc(nextName, includedIbcInstitutions))
                  setIncludeInIbcManuallySet(false)
                }
              }}
            />
            <datalist id="invoice-institution-options">
              {knownInstitutions.map((institution) => (
                <option key={institution} value={institution} />
              ))}
            </datalist>
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
              <MoneyInput value={shiftDiscountAmount} onValueChange={setShiftDiscountAmount} />
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
                <MoneyInput
                  required
                  value={item.unitAmount}
                  onValueChange={(value) =>
                    setItems(
                      items.map((current) => (current.key === item.key ? { ...current, unitAmount: value } : current)),
                    )
                  }
                />
              </label>
              {Number(item.discountAmount) > 0 && (
                <label className="form-field invoice-item-discount">
                  <span>Descuento · miles COP</span>
                  <MoneyInput
                    value={item.discountAmount}
                    onValueChange={(value) =>
                      setItems(
                        items.map((current) =>
                          current.key === item.key ? { ...current, discountAmount: value } : current,
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

        <label className="invoice-ibc-option">
          <input
            type="checkbox"
            checked={includeInIbc}
            onChange={(event) => {
              setIncludeInIbc(event.target.checked)
              setIncludeInIbcManuallySet(true)
            }}
          />
          <span>
            <strong>Incluir en el cálculo del IBC</strong>
            <small>Desmárcala si el neto de esta factura no debe aportar a la base de cotización.</small>
          </span>
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
            <MoneyInput
              value={pdfReportedTotal === null ? "" : String(pdfReportedTotal)}
              onValueChange={(value) => setPdfReportedTotal(value === "" ? null : Number(value))}
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
                <th className="amount-column">Importes · miles COP</th>
                <th>IBC</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <Fragment key={invoice.id}>
                  <tr className="invoice-main-row">
                    <td className="invoice-number-cell">{invoice.invoiceNumber ?? "—"}</td>
                    <td className="invoice-entity-cell">{invoice.institutionName || typeLabels[invoice.type]}</td>
                    <td className="invoice-dates-cell">
                      {formatDate(invoice.invoiceDate)} / {formatDate(invoice.expectedPaymentDate)}
                    </td>
                    <td className="amount-column invoice-amounts-cell">
                      <div className="invoice-money-lines invoice-table-money-lines">
                        <div className="invoice-money-before-net">
                          <span className="invoice-money-billed">Facturado {formatAmount(invoice.grossAmount)}</span>
                          <span className="invoice-money-separator" aria-hidden="true">
                            ·
                          </span>
                          <span className="invoice-money-discount">
                            Descuentos {formatAmount(addMoney(invoice.discountAmount, invoice.shiftDiscountAmount))}
                          </span>
                        </div>
                        <strong className="invoice-money-net">Neto {formatAmount(invoice.netAmount)}</strong>
                      </div>
                    </td>
                    <td className="invoice-ibc-cell">
                      <label className="invoice-ibc-toggle">
                        <input
                          type="checkbox"
                          aria-label={`${invoice.includeInIbc ? "Excluir" : "Incluir"} ${typeLabels[invoice.type]} ${invoice.invoiceNumber ?? ""} en el cálculo del IBC`}
                          checked={invoice.includeInIbc}
                          disabled={savingIbcId !== null || invoice.status === "ANULADA"}
                          onChange={() => void toggleInvoiceIbc(invoice)}
                        />
                        <span>{invoice.includeInIbc ? "Incluir" : "Excluida"}</span>
                      </label>
                    </td>
                    <td className="invoice-status-cell">
                      <span
                        className={`invoice-status ${invoice.status === "ANULADA" ? "status-anulada" : `status-${invoice.status.toLowerCase()}`}`}
                      >
                        {invoice.status === "ANULADA"
                          ? "Anulada"
                          : invoice.creditNotes.length
                            ? `Modificada · NC ${invoice.creditNotes.at(-1)?.number}`
                            : invoice.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="invoice-row-actions-cell">
                      <div className="invoice-row-actions">
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
                      </div>
                    </td>
                  </tr>
                  {invoice.creditNotes.map((creditNote) => (
                    <tr className="invoice-credit-note-row" key={`${invoice.id}-credit-${creditNote.number}`}>
                      <td colSpan={6} className="invoice-credit-note-content-cell">
                        <div>
                          <strong>Nota crédito {creditNote.number}</strong>
                          <span>
                            {creditNote.date ? formatDate(creditNote.date) : "Sin fecha"} ·{" "}
                            {creditNote.reason || "Sin observación"}
                            {` · ${formatAmount(creditNote.amount)} mil COP · ${creditNote.action === "ANULACION" ? "Anula factura" : `Modifica neto a ${formatAmount(creditNote.resultingAmount ?? invoice.netAmount)} mil COP`}`}
                          </span>
                        </div>
                      </td>
                      <td className="invoice-credit-note-actions-cell">
                        <div className="invoice-row-actions invoice-credit-note-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Editar nota crédito ${creditNote.number}`}
                            onClick={() => editCreditNote(invoice, creditNote)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-button invoice-delete-button"
                            aria-label={`Eliminar nota crédito ${creditNote.number}`}
                            onClick={() => void deleteCreditNote(invoice, creditNote)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
