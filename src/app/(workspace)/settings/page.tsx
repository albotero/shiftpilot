import { ReplacementPeopleManager } from "@/components/calendar/ReplacementPeopleManager"
import { SomaAnnualPlanForm } from "@/components/calendar/SomaAnnualPlanForm"
import { PageHeading } from "@/components/dashboard/PageHeading"
import { ParkingRateSettingsManager } from "@/components/settings/ParkingRateSettingsManager"
import { SocialSecuritySettingsManager } from "@/components/settings/SocialSecuritySettingsManager"
import { TelegramConnectionCard } from "@/components/settings/TelegramConnectionCard"

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Preferencias"
        title="Configuración"
        description="Calendario, finanzas y notificaciones en un solo lugar."
      />
      <div className="settings-page-content">
        <section className="settings-category" aria-labelledby="settings-calendar-title">
          <h2 id="settings-calendar-title">Calendario</h2>
          <div className="settings-category-content">
            <SomaAnnualPlanForm />
            <ReplacementPeopleManager />
          </div>
        </section>
        <section className="settings-category" aria-labelledby="settings-finance-title">
          <h2 id="settings-finance-title">Finanzas</h2>
          <div className="settings-category-content">
            <SocialSecuritySettingsManager />
            <ParkingRateSettingsManager />
          </div>
        </section>
        <section className="settings-category" aria-labelledby="settings-notifications-title">
          <h2 id="settings-notifications-title">Notificaciones</h2>
          <div className="settings-category-content">
            <TelegramConnectionCard />
          </div>
        </section>
      </div>
    </>
  )
}
