import { DebtSummaryCard } from "@/components/debt/DebtSummaryCard"
import { DebtPaymentsManager } from "@/components/debt/DebtPaymentsManager"
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
        <DebtPaymentsManager />
      </div>
    </>
  )
}
