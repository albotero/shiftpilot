UPDATE "AppSetting"
SET "value" = jsonb_set("value", '{yearEndMode}', '"UNPLANNED"'::jsonb)
WHERE "key" LIKE 'soma.annualPlan.%'
  AND "value" ->> 'yearEndMode' = 'VACACIONES';

DELETE FROM "Vacation"
WHERE "annualPlanYear" IS NOT NULL;UPDATE "AppSetting"
SET "value" = jsonb_set("value", '{yearEndMode}', '"UNPLANNED"'::jsonb)
WHERE "key" LIKE 'soma.annualPlan.%'
  AND "value" ->> 'yearEndMode' = 'VACACIONES';

DELETE FROM "Vacation"
WHERE "annualPlanYear" IS NOT NULL;UPDATE "AppSetting"
SET "value" = jsonb_set("value", '{yearEndMode}', '"UNPLANNED"'::jsonb)
WHERE "key" LIKE 'soma.annualPlan.%'
  AND "value" ->> 'yearEndMode' = 'VACACIONES';

DELETE FROM "Vacation"
WHERE "annualPlanYear" IS NOT NULL;