import { describe, expect, it } from "vitest"
import { isInstitutionIncludedInIbc, normalizeInstitutionName, uniqueInstitutionNames } from "./ibc-institutions"

describe("IBC institution matching", () => {
  it("matches institution names independent of accents and punctuation", () => {
    expect(normalizeInstitutionName("SOCIEDAD MEDICA ANTIOQUEÑA S.A.")).toBe("sociedadmedicaantioquenasa")
    expect(isInstitutionIncludedInIbc("SOCIEDAD MEDICA ANTIOQUEÑA SA", ["Sociedad Médica Antioqueña S.A."])).toBe(true)
  })

  it("deduplicates equivalent institution names while preserving display names", () => {
    expect(uniqueInstitutionNames(["  Soma IPS SAS ", "SOMA IPS S.A.S.", "Sedarte"])).toEqual([
      "Soma IPS SAS",
      "Sedarte",
    ])
    expect(isInstitutionIncludedInIbc(null, ["Soma"])).toBe(false)
  })
})
