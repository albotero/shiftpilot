import { DebtSummaryCard } from "@/components/debt/DebtSummaryCard"
import { PageHeading } from "@/components/dashboard/PageHeading"

export default function DebtPage() {
  return (
    <>
      <PageHeading
        eyebrow="Plan financiero"
        title="Deuda"
        description="Saldo programado, cuotas, pagos y parqueadero."
      />
      <div className="debt-page-content">
        <DebtSummaryCard />
      </div>
    </>
  )
}
