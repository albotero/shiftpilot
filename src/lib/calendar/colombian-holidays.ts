export type ColombianHoliday = {
  date: string
  name: string
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function makeDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function moveToMonday(date: Date) {
  const daysUntilMonday = (8 - date.getUTCDay()) % 7
  return addDays(date, daysUntilMonday)
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return makeDate(year, month, day)
}

export function getColombianHolidays(year: number): ColombianHoliday[] {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) {
    throw new RangeError("year must be an integer between 1900 and 9998")
  }

  const holidays: ColombianHoliday[] = []
  const add = (date: Date, name: string) => holidays.push({ date: toDateKey(date), name })
  const fixed = (month: number, day: number, name: string, transferToMonday = false) => {
    const date = makeDate(year, month, day)
    add(transferToMonday ? moveToMonday(date) : date, name)
  }

  fixed(1, 1, "Año Nuevo")
  fixed(1, 6, "Día de los Reyes Magos", true)
  fixed(3, 19, "Día de San José", true)
  fixed(5, 1, "Día del Trabajo")
  fixed(6, 29, "San Pedro y San Pablo", true)
  fixed(7, 20, "Día de la Independencia")
  fixed(8, 7, "Batalla de Boyacá")
  fixed(8, 15, "Asunción de la Virgen", true)
  fixed(10, 12, "Día de la Raza", true)
  fixed(11, 1, "Todos los Santos", true)
  fixed(11, 11, "Independencia de Cartagena", true)
  fixed(12, 8, "Inmaculada Concepción")
  fixed(12, 25, "Navidad")

  const easter = easterSunday(year)
  add(addDays(easter, -3), "Jueves Santo")
  add(addDays(easter, -2), "Viernes Santo")
  add(moveToMonday(addDays(easter, 39)), "Ascensión del Señor")
  add(moveToMonday(addDays(easter, 60)), "Corpus Christi")
  add(moveToMonday(addDays(easter, 68)), "Sagrado Corazón de Jesús")

  return holidays.sort((left, right) => left.date.localeCompare(right.date))
}

export function getColombianHoliday(date: string) {
  const year = Number(date.slice(0, 4))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  return getColombianHolidays(year).find((holiday) => holiday.date === date)
}
