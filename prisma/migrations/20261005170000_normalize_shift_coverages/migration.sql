WITH legacy_names AS (
    SELECT
        LOWER(BTRIM("anesthesiologist")) AS normalized_name,
        MIN(BTRIM("anesthesiologist")) AS name
    FROM "Shift"
    WHERE "anesthesiologist" IS NOT NULL
      AND BTRIM("anesthesiologist") <> ''
    GROUP BY LOWER(BTRIM("anesthesiologist"))
)
INSERT INTO "ReplacementPerson" ("id", "name", "active", "createdAt", "updatedAt")
SELECT
    'legacy-' || MD5(normalized_name),
    name,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM legacy_names
WHERE NOT EXISTS (
    SELECT 1
    FROM "ReplacementPerson" person
    WHERE LOWER(BTRIM(person."name")) = legacy_names.normalized_name
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ShiftCoverage" ("id", "shiftId", "personId", "createdAt")
SELECT
    'legacy-' || MD5(shift."id" || ':' || person.id),
    shift."id",
    person.id,
    CURRENT_TIMESTAMP
FROM "Shift" shift
JOIN LATERAL (
    SELECT candidate."id"
    FROM "ReplacementPerson" candidate
    WHERE LOWER(BTRIM(candidate."name")) = LOWER(BTRIM(shift."anesthesiologist"))
    ORDER BY candidate."active" DESC, candidate."createdAt", candidate."id"
    LIMIT 1
) person ON TRUE
WHERE shift."anesthesiologist" IS NOT NULL
  AND BTRIM(shift."anesthesiologist") <> ''
  AND NOT EXISTS (
      SELECT 1 FROM "ShiftCoverage" coverage WHERE coverage."shiftId" = shift."id"
  )
ON CONFLICT ("shiftId", "personId") DO NOTHING;