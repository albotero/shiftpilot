"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Pencil, Trash2 } from "lucide-react"
import { MoneyInput } from "@/components/forms/MoneyInput"
import type { DebtSummary } from "@/lib/debt/calculations"
import { addMoney, subtractMoney } from "@/lib/money/integer"

type PaymentAllocation = {
  installment: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  unclassifiedAmount: number
  balanceAfterAmount: number
}

type DebtPaymentRecord = {
  id: string
  paidAt: string
  amount: number
  parkingAmount: number
  notes: string | null
  allocations: PaymentAllocation[]
}

type DebtLedger = {
  summary: DebtSummary
  parkingRateAmount: number
  unpaidInstallments: { installment: number; dueDate: string; remainingAmount: number }[]
  nextInstallment: {
    installment: number
    dueDate: string
    scheduledAmount: number
    amount: number
    parkingAmount: number
    totalTransferAmount: number
    principalAmount: number
    interestAmount: number
  } | null
  payments: DebtPaymentRecord[]
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

function formatPaymentDate(date: string) {
  return format(new Date(`${date}T12:00:00`), "dd MMM yyyy", { locale: es })
}

function formatPaymentMonth(date: string) {
  return format(new Date(`${date}T12:00:00`), "MMMM yyyy", { locale: es })
}

function getInstallmentAmount(ledger: DebtLedger, value: string) {
  const installments = ledger.unpaidInstallments.slice(0, Number(value))
  return addMoney(...installments.map((installment) => installment.remainingAmount))
}

export function DebtPaymentsManager() {
  const [ledger, setLedger] = useState<DebtLedger | null>(null)
  const [paidAt, setPaidAt] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const initialParkingYear = useRef(Number(paidAt.slice(0, 4)))
  const [installmentsCount, setInstallmentsCount] = useState("1")
  const [amount, setAmount] = useState("")
  const [parkingAmount, setParkingAmount] = useState("")
  const [parkingRateAmount, setParkingRateAmount] = useState(0)
  const [parkingRateLoading, setParkingRateLoading] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const parkingRateRequestId = useRef(0)
  const capitalPaidPercentage =
    ledger && ledger.summary.principalTotal > 0
      ? Math.round((ledger.summary.principalPaid / ledger.summary.principalTotal) * 1000) / 10
      : 0
  const paidPlanPercentage =
    ledger && ledger.summary.scheduledAmount > 0
      ? Math.round((ledger.summary.paymentsApplied / ledger.summary.scheduledAmount) * 1000) / 10
      : 0
  const principalBalance = ledger
    ? Math.max(0, subtractMoney(ledger.summary.principalTotal, ledger.summary.principalPaid))
    : 0
  const hasUnpaidInstallments = Boolean(ledger?.unpaidInstallments.length)
  const showPaymentForm = hasUnpaidInstallments || editingPaymentId !== null

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/debt/payments?year=${initialParkingYear.current}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el plan de pagos.")
        if (!controller.signal.aborted) {
          const currentLedger = result as DebtLedger
          setLedger(currentLedger)
          setParkingRateAmount(currentLedger.parkingRateAmount)
          setParkingAmount(String(currentLedger.parkingRateAmount))
          setAmount(currentLedger.unpaidInstallments.length > 0 ? String(getInstallmentAmount(currentLedger, "1")) : "")
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el plan de pagos.")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  async function selectPaidAt(value: string) {
    setPaidAt(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const requestId = ++parkingRateRequestId.current
    setParkingRateLoading(true)
    try {
      const response = await fetch(`/api/parking-rates?year=${value.slice(0, 4)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la tarifa de parqueadero.")
      if (requestId !== parkingRateRequestId.current) return
      const parkingRate = result as { year: number; amount: number }
      setParkingRateAmount(parkingRate.amount)
      setParkingAmount(String(parkingRate.amount * Number(installmentsCount)))
    } catch (loadError) {
      if (requestId === parkingRateRequestId.current) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo consultar la tarifa de parqueadero.")
      }
    } finally {
      if (requestId === parkingRateRequestId.current) setParkingRateLoading(false)
    }
  }

  function selectInstallments(value: string) {
    setInstallmentsCount(value)
    if (!ledger) return
    setAmount(String(getInstallmentAmount(ledger, value)))
    setParkingAmount(String(parkingRateAmount * Math.min(Number(value), ledger.unpaidInstallments.length)))
  }

  function editPayment(payment: DebtPaymentRecord) {
    setEditingPaymentId(payment.id)
    setInstallmentsCount("1")
    setPaidAt(payment.paidAt)
    setAmount(String(payment.amount))
    setParkingAmount(String(payment.parkingAmount))
    setNotes(payment.notes ?? "")
    setError("")
    setMessage("")
  }

  function cancelPaymentEdit() {
    setEditingPaymentId(null)
    setPaidAt(format(new Date(), "yyyy-MM-dd"))
    setInstallmentsCount("1")
    setAmount(ledger && hasUnpaidInstallments ? String(getInstallmentAmount(ledger, "1")) : "")
    setParkingAmount(String(parkingRateAmount))
    setNotes("")
    setError("")
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const paymentId = editingPaymentId
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/debt/payments", {
        method: paymentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(paymentId ? { id: paymentId } : {}),
          paidAt,
          amount: Number(amount),
          parkingAmount: Number(parkingAmount),
          notes,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el pago.")
      const updatedLedger = result as DebtLedger
      setLedger(updatedLedger)
      setParkingRateAmount(updatedLedger.parkingRateAmount)
      setAmount(updatedLedger.unpaidInstallments.length > 0 ? String(getInstallmentAmount(updatedLedger, "1")) : "")
      setInstallmentsCount("1")
      setParkingAmount(String(updatedLedger.parkingRateAmount))
      setEditingPaymentId(null)
      setNotes("")
      setMessage(
        paymentId
          ? "Pago actualizado y asignaciones recalculadas."
          : "Pago guardado y asignado por antigüedad. El parqueadero quedó separado.",
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el pago.")
    } finally {
      setSaving(false)
    }
  }

  async function deletePayment(payment: DebtPaymentRecord) {
    if (
      !window.confirm(`¿Eliminar el pago del ${formatPaymentDate(payment.paidAt)}? Se recalcularán las asignaciones.`)
    )
      return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/debt/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payment.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar el pago.")
      const updatedLedger = result as DebtLedger
      setLedger(updatedLedger)
      setEditingPaymentId(null)
      setInstallmentsCount("1")
      setAmount(updatedLedger.unpaidInstallments.length > 0 ? String(getInstallmentAmount(updatedLedger, "1")) : "")
      setParkingRateAmount(updatedLedger.parkingRateAmount)
      setParkingAmount(String(updatedLedger.parkingRateAmount))
      setMessage("Pago eliminado y asignaciones recalculadas.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el pago.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="debt-payments-panel" aria-labelledby="debt-payments-title">
      <div className="debt-payments-heading">
        <div>
          <p className="eyebrow">Registro real</p>
          <h2 id="debt-payments-title">Pagos y asignación</h2>
        </div>
      </div>

      {showPaymentForm && (
        <>
          <form className="debt-payment-form" onSubmit={savePayment}>
            {editingPaymentId && <p className="debt-payment-editing">Editando pago del {formatPaymentDate(paidAt)}</p>}
            <label className="form-field">
              <span>Fecha del pago</span>
              <input
                id="debt-payment-date"
                aria-label="Fecha del pago"
                type="date"
                value={paidAt}
                onChange={(event) => void selectPaidAt(event.target.value)}
                required
              />
            </label>
            {!editingPaymentId && (
              <label className="form-field">
                <span>Cuotas a cubrir</span>
                <select
                  value={installmentsCount}
                  disabled={!ledger || ledger.unpaidInstallments.length === 0}
                  onChange={(event) => selectInstallments(event.target.value)}
                >
                  <option value="1">1 cuota</option>
                  <option value="2" disabled={!ledger || ledger.unpaidInstallments.length < 2}>
                    2 cuotas
                  </option>
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Abono a deuda · miles COP</span>
              <MoneyInput required value={amount} onValueChange={setAmount} />
            </label>
            <label className="form-field">
              <span>Parqueadero · miles COP</span>
              <MoneyInput value={parkingAmount} onValueChange={setParkingAmount} />
            </label>
            <label className="form-field">
              <span>Notas · opcional</span>
              <input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="debt-payment-form-actions">
              <button
                type="submit"
                className="submit-button debt-payment-submit"
                disabled={saving || parkingRateLoading}
              >
                {saving ? "Guardando…" : editingPaymentId ? "Guardar cambios" : "Registrar pago"}
              </button>
              {editingPaymentId && (
                <button type="button" className="cancel-button" onClick={cancelPaymentEdit} disabled={saving}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
          <p className="debt-payment-rule">
            FIFO: se cubren las cuotas pendientes más antiguas, interés y luego capital. Puedes registrar dos cuotas
            juntas; no se agrega interés de mora y el parqueadero se suma por cuota.
          </p>
        </>
      )}
      {!loading && ledger && !hasUnpaidInstallments && (
        <p className="debt-payment-rule" role="status">
          No quedan cuotas pendientes para registrar.
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="annual-plan-message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="replacement-people-empty">Cargando pagos…</p>
      ) : ledger ? (
        <>
          <dl className="debt-payment-summary">
            <div>
              <dt>Pagado real / plan fijo</dt>
              <dd>
                {formatAmount(ledger.summary.paymentsApplied)} / {formatAmount(ledger.summary.scheduledAmount)} mil
              </dd>
              <small>{formatAmount(paidPlanPercentage)}% pagado</small>
            </div>
            <div>
              <dt>Capital pagado / total capital</dt>
              <dd>
                {formatAmount(ledger.summary.principalPaid)} / {formatAmount(ledger.summary.principalTotal)} mil
              </dd>
              <small>{formatAmount(capitalPaidPercentage)}% pagado</small>
            </div>
            <div>
              <dt>Saldo a capital</dt>
              <dd>{formatAmount(principalBalance)} mil</dd>
            </div>
            <div>
              <dt>Saldo pendiente (capital + intereses)</dt>
              <dd>{formatAmount(ledger.summary.balanceAmount)} mil</dd>
            </div>
          </dl>

          {ledger.payments.length > 0 ? (
            <ul className="debt-payment-list">
              {[...ledger.payments].reverse().map((payment) => (
                <li key={payment.id}>
                  <div className="debt-payment-record-heading">
                    <div>
                      <strong>{formatPaymentDate(payment.paidAt)}</strong>
                      {payment.notes && <span>{payment.notes}</span>}
                    </div>
                    <strong className="debt-payment-record-total">
                      {formatAmount(addMoney(payment.amount, payment.parkingAmount))} mil
                    </strong>
                    <div className="debt-payment-record-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Editar pago del ${formatPaymentDate(payment.paidAt)}`}
                        title="Editar pago"
                        disabled={saving}
                        onClick={() => editPayment(payment)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Eliminar pago del ${formatPaymentDate(payment.paidAt)}`}
                        title="Eliminar pago"
                        disabled={saving}
                        onClick={() => void deletePayment(payment)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="debt-payment-record-totals">
                    <span>
                      Abono a deuda <b>{formatAmount(payment.amount)} mil</b>
                    </span>
                    <span>
                      Parqueadero <b>{formatAmount(payment.parkingAmount)} mil</b>
                    </span>
                  </div>
                  {payment.allocations.length > 0 && (
                    <ul className="debt-payment-allocation-list">
                      {payment.allocations.map((allocation) => (
                        <li key={`${payment.id}-${allocation.installment}`}>
                          <div className="debt-payment-allocation-heading">
                            <strong>Cuota {allocation.installment}</strong>
                            <span>{formatPaymentMonth(allocation.dueDate)}</span>
                          </div>
                          <span>
                            Interés {formatAmount(allocation.interestAmount)} · Capital{" "}
                            {formatAmount(allocation.principalAmount)} · Saldo a capital{" "}
                            {formatAmount(allocation.balanceAfterAmount)}
                            {Number.isFinite(allocation.unclassifiedAmount) &&
                              allocation.unclassifiedAmount > 0 &&
                              ` · Sin clasificar ${formatAmount(allocation.unclassifiedAmount)} mil`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="replacement-people-empty">Todavía no hay pagos reales registrados.</p>
          )}
        </>
      ) : null}
    </section>
  )
}
