export function formatDateDmy(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return ""
  const [, year, month, day] = match
  return parseDateDmy(`${day}/${month}/${year}`) ? `${day}/${month}/${year}` : ""
}

export function parseDateDmy(displayDate: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(displayDate)
  if (!match) return null
  const [, day, month, year] = match
  const isoDate = `${year}-${month}-${day}`
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10) === isoDate ? isoDate : null
}
