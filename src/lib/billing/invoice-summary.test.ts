import { describe, expect, it } from "vitest"
import { getInvoiceTotalDiscount, groupInvoiceAmountsByInstitution, sumInvoiceEntityAmounts } from "./invoice-summary"

describe("invoice totals by institution", () => {
  it("groups by entity, falls back to type and excludes annulled invoices", () => {
    expect(
      groupInvoiceAmountsByInstitution([
        {
          institutionName: "SOMA IPS",
          type: "SOMA_POS",
          grossAmount: 110.25,
          netAmount: 100.125,
          discountAmount: 10,
          shiftDiscountAmount: 0.125,
          status: "FACTURADA",
        },
        {
          institutionName: "SOMA IPS",
          type: "SOMA_PREPAGADA",
          grossAmount: 220.375,
          netAmount: 200.125,
          discountAmount: 20.25,
          shiftDiscountAmount: 0,
          status: "PAGADA",
        },
        {
          institutionName: null,
          type: "SEDARTE",
          grossAmount: 50,
          netAmount: 50,
          discountAmount: 0,
          shiftDiscountAmount: 0,
          status: "FACTURADA",
        },
        {
          institutionName: "SOMA IPS",
          type: "SOMA_POS",
          grossAmount: 350,
          netAmount: 300,
          discountAmount: 50,
          shiftDiscountAmount: 0,
          status: "ANULADA",
        },
      ]),
    ).toEqual([
      { institutionName: "SOMA IPS", count: 2, grossAmount: 330.625, discountAmount: 30.375, netAmount: 300.25 },
      { institutionName: "SEDARTE", count: 1, grossAmount: 50, discountAmount: 0, netAmount: 50 },
    ])
  })

  it("sums entity totals with integer money arithmetic", () => {
    expect(sumInvoiceEntityAmounts([100.125, 200.125])).toBe(300.25)
    expect(getInvoiceTotalDiscount({ discountAmount: 10.25, shiftDiscountAmount: 1.125 })).toBe(11.375)
  })
})
