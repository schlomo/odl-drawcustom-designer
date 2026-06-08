import * as mdiPaths from '@mdi/js'

function exportNameToKebab(exportName: string): string {
  const withoutPrefix = exportName.slice(3)
  return withoutPrefix.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

let cachedIconNames: readonly string[] | null = null

function getMdiIconNames(): readonly string[] {
  if (!cachedIconNames) {
    cachedIconNames = Object.keys(mdiPaths)
      .filter((key) => key.startsWith('mdi') && key.length > 3)
      .map(exportNameToKebab)
      .sort()
  }
  return cachedIconNames
}

function normalizeIconQuery(query: string): string {
  return query.trim().replace(/^mdi:/i, '').toLowerCase()
}

function queryTokens(normalized: string): string[] {
  return normalized.split(/\s+/).filter(Boolean)
}

function allTokensMatch(name: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => name.includes(token))
}

/** Lower rank = better match. Returns null when the name does not match. */
function iconNameMatchRank(name: string, tokens: readonly string[]): number | null {
  if (tokens.length === 0) {
    return null
  }

  if (tokens.length === 1) {
    const token = tokens[0]!
    if (name.startsWith(token)) {
      return 0
    }
    if (name.includes(token)) {
      return 1
    }
    return null
  }

  if (!allTokensMatch(name, tokens)) {
    return null
  }

  if (name.startsWith(tokens[0]!)) {
    return 0
  }
  return 1
}

/** Filter MDI icon names for search-as-you-type autocomplete. */
export function filterMdiIconNames(query: string, limit = 50): string[] {
  const normalized = normalizeIconQuery(query)
  if (!normalized) {
    return []
  }

  const tokens = queryTokens(normalized)
  const buckets: string[][] = [[], []]

  for (const name of getMdiIconNames()) {
    const rank = iconNameMatchRank(name, tokens)
    if (rank == null) {
      continue
    }
    buckets[rank]!.push(name)
  }

  return buckets.flat().slice(0, limit)
}

/** Names for YAML/property autocomplete (substring filter; empty query → no suggestions). */
export function listMdiIconNamesForCompletion(prefix?: string, limit = 50): string[] {
  const trimmed = prefix ? normalizeIconQuery(prefix) : ''
  if (!trimmed) {
    return []
  }
  return filterMdiIconNames(trimmed, limit)
}
