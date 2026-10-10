import { describe, expect, it } from "vitest"
import { buildDebtPaymentShareText, formatPesos, getWhatsAppShareUrl } from "./payment-share"

describe("debt payment share", () => {
  it("formats thousands of COP as full pesos", () => {
    expect(formatPesos(1234.567)).toBe("$1.234.567")
    expect(formatPesos(0)).toBe("$0")
  })

  it("includes payment data and every covered installment", () => {
    const text = buildDebtPaymentShareText({
      paidAt: "2026-10-05",
      amount: 3000.5,
      parkingAmount: 120,
      notes: " Transferencia Bancolombia ",
      allocations: [
        {
          installment: 4,
          dueDate: "2026-09-30",
          interestAmount: 400,
          principalAmount: 1100,
          unclassifiedAmount: 0,
          balanceAfterAmount: 18889.75,
          totalBalanceAfterAmount: 21499.5,
          installmentAmount: 1500,
          installmentBalanceAfterAmount: 0,
        },
        {
          installment: 5,
          dueDate: "2026-10-31",
          interestAmount: 390.25,
          principalAmount: 1110.25,
          unclassifiedAmount: 0.001,
          balanceAfterAmount: 18889.75,
          totalBalanceAfterAmount: 21499.5,
          installmentAmount: 1500.501,
          installmentBalanceAfterAmount: 0,
        },
      ],
    })

    expect(text).toBe(
      [
        "Fecha de transferencia: 05-oct-2026",
        "Total transferido: *$3.120.500*",
        "• Abono a deuda: $3.000.500",
        "• Parqueadero: $120.000",
        "Notas: Transferencia Bancolombia",
        "",
        "Saldos después del pago:",
        "• Saldo a capital: $18.889.750",
        "• Saldo total (capital + intereses): $21.499.500",
        "",
        "────────────────────",
        "",
        "*Cuota 4* · septiembre 2026",
        "• Capital: $1.100.000",
        "• Intereses: $400.000",
        "• Total de la cuota: *$1.500.000*",
        "• Estado después del pago: Cancelada",
        "",
        "*Cuota 5* · octubre 2026",
        "• Capital: $1.110.250",
        "• Intereses: $390.250",
        "• Sin clasificar: $1",
        "• Total de la cuota: *$1.500.501*",
        "• Estado después del pago: Cancelada",
      ].join("\n"),
    )
  })

  it.each([500, 0])("reports the historical installment balance after a partial contribution: %s", (remaining) => {
    const text = buildDebtPaymentShareText({
      paidAt: "2026-10-05",
      amount: 500,
      parkingAmount: 0,
      notes: null,
      allocations: [{
        installment: 1,
        dueDate: "2026-10-01",
        principalAmount: 400,
        interestAmount: 100,
        unclassifiedAmount: 0,
        balanceAfterAmount: 600,
        totalBalanceAfterAmount: 1500,
        installmentAmount: 1000,
        installmentBalanceAfterAmount: remaining,
      }],
    })
    expect(text).toContain("• Capital abonado: $400.000\n• Intereses abonados: $100.000")
    expect(text).toContain("• Total de la cuota: *$1.000.000*\n• Abono en este pago: $500.000")
    expect(text).toContain(
      remaining === 0
        ? "• Estado después del pago: Cancelada"
        : "• Estado después del pago: Pendiente *$500.000*",
    )
    expect(text.match(/Saldo a capital:/g)).toHaveLength(1)
  })

  it("omits empty notes and installments when nothing was allocated", () => {
    const text = buildDebtPaymentShareText({ paidAt: "2026-10-05", amount: 10, parkingAmount: 0, notes: null, allocations: [] })
    expect(text).not.toContain("Notas")
    expect(text).not.toContain("Cuota")
  })

  it("builds an encoded WhatsApp link", () => {
    expect(getWhatsAppShareUrl("*Pago* & más")).toBe("https://wa.me/?text=*Pago*%20%26%20m%C3%A1s")
  })
})
