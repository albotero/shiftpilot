export function normalizeInstitutionName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

export function isInstitutionIncludedInIbc(institutionName: string | null | undefined, includedInstitutions: string[]) {
  if (!institutionName) return false
  const normalizedName = normalizeInstitutionName(institutionName)
  return includedInstitutions.some((institution) => normalizeInstitutionName(institution) === normalizedName)
}

export function uniqueInstitutionNames(values: string[]) {
  const names = new Map<string, string>()
  for (const value of values) {
    const name = value.trim().replace(/\s+/g, " ")
    const normalized = normalizeInstitutionName(name)
    if (normalized && !names.has(normalized)) names.set(normalized, name)
  }
  return [...names.values()]
}
