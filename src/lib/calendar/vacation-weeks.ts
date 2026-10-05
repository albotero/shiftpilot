const millisecondsPerDay = 24 * 60 * 60 * 1000

function parseDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`)
  }
  return value
}

export function getVacationEndDate(startDate: string, weeks: number) {
  if (!Number.isInteger(weeks) || weeks < 1) throw new RangeError("Vacation weeks must be a positive integer")
  const endDate = parseDate(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + weeks * 7 - 1)
  return endDate.toISOString().slice(0, 10)
}

export function getVacationWeekCount(startDate: string, endDate: string) {
  const days = Math.round((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / millisecondsPerDay) + 1
  if (days < 1 || days % 7 !== 0) throw new RangeError("Vacation must contain complete seven-day weeks")
  return days / 7
}

export function isCompleteVacationRange(startDate: string, endDate: string) {
  try {
    getVacationWeekCount(startDate, endDate)
    return true
  } catch {
    return false
  }
}
