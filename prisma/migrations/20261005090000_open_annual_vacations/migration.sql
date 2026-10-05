ALTER TABLE "Vacation" ALTER COLUMN "endDate" DROP NOT NULL;

ALTER TABLE "Vacation" ADD COLUMN "annualPlanYear" INTEGER;

CREATE UNIQUE INDEX "Vacation_annualPlanYear_key" ON "Vacation"("annualPlanYear");