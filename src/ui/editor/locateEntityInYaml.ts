/** Document offset for the first character of `entityId` in YAML template strings. */
export function locateFirstEntityOccurrenceInYaml(doc: string, entityId: string): number | null {
  if (!entityId) {
    return null
  }

  const candidates: number[] = []

  for (const quote of ["'", '"'] as const) {
    const pos = doc.indexOf(`${quote}${entityId}${quote}`)
    if (pos >= 0) {
      candidates.push(pos + 1)
    }
  }

  const escaped = entityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Dotted access on the `states` global (`states.<domain>.<object>`,
  // ADR-004) has no quotes to anchor on, and the id always sits right after a
  // literal `states.` — itself a dot. The bare-identifier fallback below
  // excludes any match preceded by a dot (to dodge fragments of a longer
  // chain), so it would never see this form. Anchor on the `states.` prefix
  // instead, mirroring the extraction guard in core/templates/patterns.ts
  // (STATES_DOTTED_PATTERN) so a member named `states` on something else
  // still names no entity.
  const dottedMatch = new RegExp(`(?<![\\w.$])states\\.${escaped}(?![a-z0-9_])`, 'i').exec(doc)
  if (dottedMatch) {
    candidates.push(dottedMatch.index + 'states.'.length)
  }

  const bareMatch = new RegExp(`(?<![a-z0-9_.])${escaped}(?![a-z0-9_])`, 'i').exec(doc)
  if (bareMatch) {
    candidates.push(bareMatch.index)
  }

  return candidates.length > 0 ? Math.min(...candidates) : null
}
