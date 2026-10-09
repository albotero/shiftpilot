import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { format } from "date-fns"
import { CalendarDays, LayoutDashboard } from "lucide-react"
import { isPublicShareRequest } from "@/lib/calendar/shared-access"

export const metadata: Metadata = {
  title: "Página no encontrada · ShiftPilot",
}

export default async function NotFound() {
  const requestHeaders = await headers()
  const isPublicShare = isPublicShareRequest({
    method: "GET",
    pathname: "",
    host: requestHeaders.get("host"),
    cloudflareRay: requestHeaders.get("cf-ray"),
    shareBaseUrl: process.env.SHIFTPILOT_SHARE_URL,
  })
  const currentMonthPath = `/${format(new Date(), "yyyy/MM")}`

  return (
    <main className="not-found-page">
      <section className="not-found-card" aria-labelledby="not-found-title">
        <span className="shared-calendar-mark">
          <LayoutDashboard size={17} />
        </span>
        <p className="not-found-code">404</p>
        <h1 id="not-found-title">Página no encontrada</h1>
        <p>
          {isPublicShare
            ? "Esta dirección no corresponde a un calendario compartido."
            : "La página que buscas no existe o fue movida."}
        </p>
        <Link className="not-found-action" href={isPublicShare ? currentMonthPath : "/"}>
          {isPublicShare ? <CalendarDays size={16} /> : <LayoutDashboard size={16} />}
          {isPublicShare ? "Ver el calendario de este mes" : "Volver a ShiftPilot"}
        </Link>
      </section>
    </main>
  )
}
