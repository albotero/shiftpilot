import { ReplacementPeopleManager } from "@/components/calendar/ReplacementPeopleManager"
import { SomaAnnualPlanForm } from "@/components/calendar/SomaAnnualPlanForm"
import { PageHeading } from "@/components/dashboard/PageHeading"

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Preferencias"
        title="Configuración"
        description="Plan anual de Soma y catálogo de personas de reemplazo."
      />
      <div className="settings-page-content">
        <SomaAnnualPlanForm />
        <ReplacementPeopleManager />
      </div>
    </>
  )
}
