import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatPesos } from "@/lib/debt/payment-share"
import { addMoney } from "@/lib/money/integer"
import type { CoveredShiftDetail } from "./coverage-compensation"

export function buildCoveredShiftShareText(
  shifts: CoveredShiftDetail[],
  selectedIds: ReadonlySet<string>,
  month: Date,
  includeDateDetails = false,
) {
  const selectedShifts = shifts.filter((shift) => selectedIds.has(shift.id))
  if (selectedShifts.length === 0) return ""

  const shiftsByAnesthesiologist = new Map<string, CoveredShiftDetail[]>()
  for (const shift of selectedShifts) {
    const personShifts = shiftsByAnesthesiologist.get(shift.anesthesiologist) ?? []
    personShifts.push(shift)
    shiftsByAnesthesiologist.set(shift.anesthesiologist, personShifts)
  }

  const lines = [`*Jornadas cubiertas · ${format(month, "MMMM yyyy", { locale: es })}*`]
  let totalJornadas = 0
  let totalAmountThousands = 0

  for (const [anesthesiologist, personShifts] of [...shiftsByAnesthesiologist].sort(([left], [right]) =>
    left.localeCompare(right, "es"),
  )) {
    const jornadas = personShifts.reduce((total, shift) => total + shift.jornadas, 0)
    const amountThousands = addMoney(...personShifts.map((shift) => shift.amountThousands))
    totalJornadas += jornadas
    totalAmountThousands = addMoney(totalAmountThousands, amountThousands)
    lines.push("", `*${anesthesiologist}*`)
    if (includeDateDetails) {
      const periodsByDate = new Map<string, Set<string>>()
      for (const shift of personShifts) {
        const periods = periodsByDate.get(shift.date) ?? new Set<string>()
        shift.period.split(" + ").forEach((period) => periods.add(period))
        periodsByDate.set(shift.date, periods)
      }
      for (const [date, periods] of periodsByDate) {
        lines.push(
          `• ${format(new Date(`${date}T12:00:00`), "d MMM", { locale: es })} · ${[...periods].sort().join(" + ")}`,
        )
      }
    }
    const personTotal = `${jornadas} ${jornadas === 1 ? "jornada" : "jornadas"} · ${formatPesos(amountThousands)}`
    lines.push(includeDateDetails ? `*Total: ${personTotal}*` : `• ${personTotal}`)
  }

  if (shiftsByAnesthesiologist.size > 1) {
    lines.push(
      "",
      `*Total: ${totalJornadas} ${totalJornadas === 1 ? "jornada" : "jornadas"} · ${formatPesos(totalAmountThousands)}*`,
    )
  }
  return lines.join("\n")
}
