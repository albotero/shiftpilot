"use client"

import { useEffect, useState } from "react"
import { groupInvoiceAmountsByInstitution, sumInvoiceEntityAmounts } from "@/lib/billing/invoice-summary"

type InvoiceSummaryRecord = {
  institutionName: string | null
  type: string
  grossAmount: number
  netAmount: number
  discountAmount: number
  shiftDiscountAmount: number
  status: string
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(amount)
}

export function InvoiceEntitySummary({ month, refreshToken }: { month: string; refreshToken: number }) {
  const requestKey = `${month}:${refreshToken}`
  const [result, setResult] = useState<{ requestKey: string; invoices: InvoiceSummaryRecord[] } | null>(null)
  const [loadError, setLoadError] = useState<{ requestKey: string; message: string } | null>(null)
  const invoices = result?.requestKey === requestKey ? result.invoices : []
  const summaries = groupInvoiceAmountsByInstitution(invoices)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/invoices?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la facturación por entidad.")
        if (controller.signal.aborted) return
        setResult({ requestKey, invoices: result as InvoiceSummaryRecord[] })
        setLoadError(null)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setLoadError({
            requestKey,
            message:
              loadError instanceof Error ? loadError.message : "No se pudo consultar la facturación por entidad.",
          })
        }
      })
    return () => controller.abort()
  }, [month, refreshToken, requestKey])

  return (
    <section className="invoice-entity-summary" aria-labelledby="invoice-entity-summary-title">
      <div className="invoice-entity-summary-heading">
        <div>
          <p className="eyebrow">Facturación del mes</p>
          <h2 id="invoice-entity-summary-title">Por entidad</h2>
        </div>
      </div>
      {result?.requestKey !== requestKey && loadError?.requestKey !== requestKey ? (
        <p className="invoice-empty">Consultando facturas…</p>
      ) : loadError?.requestKey === requestKey ? (
        <p className="form-error" role="alert">
          {loadError.message}
        </p>
      ) : summaries.length === 0 ? (
        <p className="invoice-empty">No hay facturación activa para este mes.</p>
      ) : (
        <div className="invoice-entity-summary-table-wrap">
          <table className="invoice-entity-summary-table">
            <thead>
              <tr>
                <th>Entidad</th>
                <th>Facturas</th>
                <th className="amount-column">Importes · miles COP</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.institutionName}>
                  <th scope="row">{summary.institutionName}</th>
                  <td>{summary.count}</td>
                  <td>
                    <div className="invoice-money-lines">
                      <div className="invoice-money-before-net">
                        <span className="invoice-money-billed">Facturado {formatAmount(summary.grossAmount)}</span>
                        <span className="invoice-money-separator" aria-hidden="true">
                          ·
                        </span>
                        <span className="invoice-money-discount">
                          Descuentos {formatAmount(summary.discountAmount)}
                        </span>
                      </div>
                      <strong className="invoice-money-net">Neto {formatAmount(summary.netAmount)}</strong>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total activo</th>
                <td>{summaries.reduce((total, summary) => total + summary.count, 0)}</td>
                <td>
                  <div className="invoice-money-lines">
                    <div className="invoice-money-before-net">
                      <span className="invoice-money-billed">
                        Facturado{" "}
                        {formatAmount(sumInvoiceEntityAmounts(summaries.map((summary) => summary.grossAmount)))}
                      </span>
                      <span className="invoice-money-separator" aria-hidden="true">
                        ·
                      </span>
                      <span className="invoice-money-discount">
                        Descuentos{" "}
                        {formatAmount(sumInvoiceEntityAmounts(summaries.map((summary) => summary.discountAmount)))}
                      </span>
                    </div>
                    <strong className="invoice-money-net">
                      Neto {formatAmount(sumInvoiceEntityAmounts(summaries.map((summary) => summary.netAmount)))}
                    </strong>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
