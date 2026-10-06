"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Menu,
  Settings2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { formatLongDate } from "@/lib/calendar/utils"
import {
  getCalendarConnection,
  getCalendarEntries,
  getServerCalendarConnection,
  getServerCalendarSnapshot,
  subscribeToCalendar,
  subscribeToStorageMode,
} from "@/lib/calendar/storage"

const navigation: { href: string; label: string; mobileLabel: string; icon: LucideIcon }[] = [
  { href: "/", label: "Resumen", mobileLabel: "Hoy", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", mobileLabel: "Calendario", icon: CalendarDays },
  { href: "/finance", label: "Finanzas", mobileLabel: "Finanzas", icon: Wallet },
  { href: "/debt", label: "Deuda", mobileLabel: "Deuda", icon: CreditCard },
]

const routeLabels: Record<string, string> = {
  "/": "Resumen",
  "/calendar": "Calendario",
  "/finance": "Finanzas",
  "/debt": "Deuda",
  "/settings": "Configuración",
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/"
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const calendarEntries = useSyncExternalStore(subscribeToCalendar, getCalendarEntries, getServerCalendarSnapshot)
  const storageMode = useSyncExternalStore(subscribeToStorageMode, getCalendarConnection, getServerCalendarConnection)
  const todayLabel = formatLongDate(new Date())

  function closeMobileMenu() {
    setMobileMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <aside id="primary-navigation-drawer" className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <Link className="brand" href="/" aria-label="ShiftPilot inicio" onClick={closeMobileMenu}>
            <span className="brand-mark">
              <Activity size={20} strokeWidth={2.5} />
            </span>
            <span>
              shiftpilot<span className="brand-period">.</span>
            </span>
          </Link>
          <button className="mobile-sidebar-close" type="button" aria-label="Cerrar menú" onClick={closeMobileMenu}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">CENTRO PERSONAL</div>
        <nav className="primary-nav" aria-label="Navegación principal" onClick={closeMobileMenu}>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={`nav-link ${pathname === href ? "active" : ""}`}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
              {pathname === href && <span className="nav-current" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status" title={`${calendarEntries.length} registros en agenda`}>
            <span className={`status-light ${storageMode}`} />
            <span>
              {storageMode === "loading"
                ? "Conectando con PostgreSQL"
                : storageMode === "database"
                  ? "PostgreSQL local conectado"
                  : "Modo de navegador · PostgreSQL sin conexión"}
            </span>
          </div>
          <Link
            className={`nav-link settings-link ${pathname === "/settings" ? "active" : ""}`}
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            onClick={closeMobileMenu}
          >
            <Settings2 size={17} />
            <span>Configuración</span>
          </Link>
          <div className="profile-row">
            <span className="profile-avatar">S</span>
            <span className="profile-copy">
              <strong>Mi espacio</strong>
              <small>Uso personal</small>
            </span>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation-drawer"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumb">
            <span>ShiftPilot</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{routeLabels[pathname] ?? "Resumen"}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-date">{todayLabel}</span>
          </div>
        </header>

        <div className="dashboard-content">
          {children}
          <footer className="dashboard-footer">
            <span>
              ShiftPilot <b>·</b> Valores expresados en miles de COP
            </span>
            <span>Datos locales · sin cuenta ni sincronización en nube</span>
          </footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        {navigation.map(({ href, icon: Icon, mobileLabel }) => (
          <Link
            key={href}
            className={pathname === href ? "mobile-nav-active" : ""}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={closeMobileMenu}
          >
            <Icon size={18} />
            <span>{mobileLabel}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
