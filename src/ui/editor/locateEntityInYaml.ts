/** Document offset for the first character of `entityId` in YAML template strings. */
export function locateFirstEntityOccurrenceInYaml(doc: string, entityId: string): number | null {
  if (!entityId) {
    return null
  }

  let earliestQuotePos: number | null = null

  for (const quote of ["'", '"'] as const) {
    const needle = `${quote}${entityId}${quote}`
    const pos = doc.indexOf(needle)
    if (pos >= 0 && (earliestQuotePos == null || pos < earliestQuotePos)) {
      earliestQuotePos = pos
    }
  }

  if (earliestQuotePos != null) {
    return earliestQuotePos + 1
  }

  const escaped = entityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?<![a-z0-9_.])${escaped}(?![a-z0-9_])`, 'i').exec(doc)
  return match?.index ?? null
}
