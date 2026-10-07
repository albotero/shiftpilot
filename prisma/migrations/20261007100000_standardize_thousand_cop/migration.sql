BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AppSetting" AS legacy
    JOIN "AppSetting" AS standardized
      ON standardized."key" = replace(legacy."key", 'socialSecurity.minimumWageCop.', 'socialSecurity.minimumWageAmount.')
    WHERE legacy."key" LIKE 'socialSecurity.minimumWageCop.%'
  ) THEN
    RAISE EXCEPTION 'Both legacy and standardized minimum-wage settings exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AppSetting"
    WHERE "key" = 'calendar.coveredShiftRateCop'
  ) AND EXISTS (
    SELECT 1
    FROM "AppSetting"
    WHERE "key" = 'calendar.coveredShiftRateThousands'
  ) THEN
    RAISE EXCEPTION 'Both legacy and standardized covered-shift rate settings exist';
  END IF;
END $$;

ALTER TABLE "Debt" RENAME COLUMN "sharePriceCop" TO "sharePriceAmount";
ALTER TABLE "Debt"
  ALTER COLUMN "sharePriceAmount" TYPE DECIMAL(18, 3)
  USING ("sharePriceAmount"::numeric / 1000);

ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "minimumWageCop" TO "minimumWageAmount";
ALTER TABLE "SocialSecurityPeriod"
  ALTER COLUMN "minimumWageAmount" TYPE DECIMAL(18, 3)
  USING ("minimumWageAmount"::numeric / 1000);

ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "healthAmountTenths" TO "healthAmount";
ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "pensionAmountTenths" TO "pensionAmount";
ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "arlAmountTenths" TO "arlAmount";
ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "fundAmountTenths" TO "fundAmount";
ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "solidarityAmountTenths" TO "solidarityAmount";
ALTER TABLE "SocialSecurityPeriod" RENAME COLUMN "totalAmountTenths" TO "totalAmount";

ALTER TABLE "SocialSecurityPeriod"
  ALTER COLUMN "healthAmount" TYPE DECIMAL(18, 3) USING ("healthAmount"::numeric / 10),
  ALTER COLUMN "pensionAmount" TYPE DECIMAL(18, 3) USING ("pensionAmount"::numeric / 10),
  ALTER COLUMN "arlAmount" TYPE DECIMAL(18, 3) USING ("arlAmount"::numeric / 10),
  ALTER COLUMN "fundAmount" TYPE DECIMAL(18, 3) USING ("fundAmount"::numeric / 10),
  ALTER COLUMN "solidarityAmount" TYPE DECIMAL(18, 3) USING ("solidarityAmount"::numeric / 10),
  ALTER COLUMN "totalAmount" TYPE DECIMAL(18, 3) USING ("totalAmount"::numeric / 10);

UPDATE "AppSetting" AS setting
SET
  "key" = replace(setting."key", 'socialSecurity.minimumWageCop.', 'socialSecurity.minimumWageAmount.'),
  "value" = CASE
    WHEN jsonb_typeof(setting."value") = 'object' AND setting."value" ? 'amountCop' THEN
      (setting."value" - 'amountCop') || jsonb_build_object(
        'amount', (setting."value" ->> 'amountCop')::numeric / 1000
      )
    ELSE setting."value"
  END
WHERE setting."key" LIKE 'socialSecurity.minimumWageCop.%';

UPDATE "AppSetting" AS setting
SET
  "key" = 'calendar.coveredShiftRateThousands',
  "value" = CASE jsonb_typeof(setting."value")
    WHEN 'number' THEN to_jsonb(setting."value"::text::numeric / 1000)
    WHEN 'array' THEN COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(history.item) = 'object' AND history.item ? 'amount' THEN
              (history.item - 'amount') || jsonb_build_object(
                'amountThousands', (history.item ->> 'amount')::numeric / 1000
              )
            ELSE history.item
          END
          ORDER BY history.ordinality
        )
        FROM jsonb_array_elements(setting."value") WITH ORDINALITY AS history(item, ordinality)
      ),
      '[]'::jsonb
    )
    ELSE setting."value"
  END
WHERE setting."key" = 'calendar.coveredShiftRateCop';

COMMIT;
