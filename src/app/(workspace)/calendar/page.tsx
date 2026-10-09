import type { CalendarView } from "@/lib/calendar/types"
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace"
import { PageHeading } from "@/components/dashboard/PageHeading"
import { normalizeShareBaseUrl } from "@/lib/calendar/share-url"

type SearchParams = {
  date?: string | string[]
  view?: string | string[]
  new?: string | string[]
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function validDateKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const requestedView = firstValue(params.view)
  const initialView: CalendarView = requestedView === "week" || requestedView === "agenda" ? requestedView : "month"

  return (
    <>
      <PageHeading
        className="calendar-page-heading"
        eyebrow="Tu agenda"
        title="Calendario"
        description="Turnos, eventos y disponibilidad."
      />
      <CalendarWorkspace
        initialDate={validDateKey(firstValue(params.date))}
        initialView={initialView}
        openNew={firstValue(params.new) === "1"}
        shareBaseUrl={normalizeShareBaseUrl(process.env.SHIFTPILOT_SHARE_URL)}
      />
    </>
  )
}
