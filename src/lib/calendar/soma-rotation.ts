import { getColombianHoliday } from "./colombian-holidays"
import type { SomaStatus } from "./types"

const mainRotation: SomaStatus[] = ["R4", "R3", "R2", "R1", "TURNO", "LIBRE"]
const alternateRotation: SomaStatus[] = ["R2", "R1", "TURNO"]
const millisecondsPerDay = 24 * 60 * 60 * 1000

export type SomaRotationDay = {
  date: string
  status: SomaStatus
  isHoliday: boolean
}

export function getScheduledSomaDays(days: SomaRotationDay[]) {
  return days.filter((day) => day.status !== "LIBRE")
}

function parseDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`)
  }
  return value
}

function generateSequence(
  start: string,
  end: string,
  anchorDate: string,
  anchorStatus: SomaStatus,
  sequence: SomaStatus[],
): SomaRotationDay[] {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const rotationAnchor = parseDate(anchorDate)
  if (endDate < startDate) throw new RangeError("End date must not precede start date")

  const days: SomaRotationDay[] = []
  const cursor = new Date(startDate)
  const anchorStatusIndex = sequence.indexOf(anchorStatus)
  if (anchorStatusIndex < 0) throw new RangeError(`Anchor status ${anchorStatus} is not in this rotation`)

  while (cursor <= endDate) {
    const date = cursor.toISOString().slice(0, 10)
    const dayOffset = Math.round((cursor.getTime() - rotationAnchor.getTime()) / millisecondsPerDay)
    const rotationIndex = (((anchorStatusIndex + dayOffset) % sequence.length) + sequence.length) % sequence.length
    const baseStatus = sequence[rotationIndex]
    const weekday = cursor.getUTCDay()
    let status = baseStatus

    if (weekday === 6) status = baseStatus === "R1" || baseStatus === "TURNO" ? baseStatus : "LIBRE"
    if (weekday === 0) status = baseStatus === "TURNO" ? "TURNO" : "LIBRE"

    const isHoliday = Boolean(getColombianHoliday(date))
    if (isHoliday && status !== "TURNO") status = "LIBRE"

    days.push({ date, status, isHoliday })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

export function generateSomaRotation(start: string, end: string, anchorDate: string, anchorStatus: SomaStatus) {
  return generateSequence(start, end, anchorDate, anchorStatus, mainRotation)
}

export function generateSomaAlternate(start: string, end: string) {
  return generateSequence(start, end, start, "R2", alternateRotation)
}

export function generateSomaYear(year: number, anchorDate: string, anchorStatus: SomaStatus) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) {
    throw new RangeError("year must be an integer between 1900 and 9998")
  }

  return generateSomaRotation(`${year}-01-01`, `${year}-12-31`, anchorDate, anchorStatus)
}
