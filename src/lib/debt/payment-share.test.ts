import { describe, expect, it } from "vitest"
import { buildDebtPaymentShareText, formatPesos, getWhatsAppShareUrl } from "./payment-share"

describe("debt payment share", () => {
  it("formats thousands of COP as full pesos", () => {
    expect(formatPesos(1234.567)).toBe("$1.234.567")
    expect(formatPesos(0)).toBe("$0")
  })

  it("includes payment data and every covered installment", () => {
    const text = buildDebtPaymentShareText({
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
          balanceAfterAmount: 20000,
          totalBalanceAfterAmount: 24000,
        },
        {
          installment: 5,
          dueDate: "2026-10-31",
          interestAmount: 390.25,
          principalAmount: 1110.25,
          unclassifiedAmount: 0.001,
          balanceAfterAmount: 18889.75,
          totalBalanceAfterAmount: 21499.5,
        },
      ],
    })

    expect(text).toBe(
      [
        "Total transferido: *$3.120.500*",
        "• Abono a deuda: $3.000.500",
        "• Parqueadero: $120.000",
        "Notas: Transferencia Bancolombia",
        "",
        "*Cuota 4* · septiembre 2026",
        "• Interés: $400.000",
        "• Capital: $1.100.000",
        "• Saldo a capital: $20.000.000",
        "• Saldo total: $24.000.000",
        "",
        "*Cuota 5* · octubre 2026",
        "• Interés: $390.250",
        "• Capital: $1.110.250",
        "• Sin clasificar: $1",
        "• Saldo a capital: $18.889.750",
        "• Saldo total: $21.499.500",
      ].join("\n"),
    )
  })

  it("omits empty notes and installments when nothing was allocated", () => {
    const text = buildDebtPaymentShareText({ amount: 10, parkingAmount: 0, notes: null, allocations: [] })
    expect(text).not.toContain("Notas")
    expect(text).not.toContain("Cuota")
  })

  it("builds an encoded WhatsApp link", () => {
    expect(getWhatsAppShareUrl("*Pago* & más")).toBe("https://wa.me/?text=*Pago*%20%26%20m%C3%A1s")
  })
})
