/**
 * Unquoted `{ … }` scalars in YAML are parsed as flow maps (e.g. `{{ }}` → key `{}`).
 * Quote them before parse so Jinja fragments stay strings and yaml.js stays quiet.
 */
/** Property key — plain (`size:`) or JSON-style (`"size":`). */
const PROPERTY_KEY = '(?:"[\\w.-]+"|[\\w.-]+)'

export function quoteUnquotedBraceScalars(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const match = new RegExp(`^(\\s+${PROPERTY_KEY}:\\s+)(\\{.*\\})\\s*(#.*)?$`).exec(line)
      if (!match) {
        return line
      }
      const [, prefix, value, comment = ''] = match
      // Leave real flow maps (`{ key: value }`) alone — they contain a colon.
      if (!/^\{[^:]*\}$/.test(value)) {
        return line
      }
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return `${prefix}"${escaped}"${comment}`
    })
    .join('\n')
}

/** In-memory repair when a flow map with null values slipped through parse. */
export function repairFlowMapMisparse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(repairFlowMapMisparse)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (
      entries.length > 0 &&
      entries.every(([, nested]) => nested == null || nested === undefined)
    ) {
      if (entries.length === 1) {
        const key = entries[0]![0]
        // `{{ expr }}` is parsed as a flow map whose sole key is `{ expr }`.
        if (key.startsWith('{') && key.endsWith('}')) {
          return `{${key}}`
        }
        return `{ ${key} }`
      }
      const inner = entries.map(([key]) => key).join(' ')
      return `{ ${inner} }`
    }
    const repaired: Record<string, unknown> = {}
    for (const [key, nested] of entries) {
      repaired[key] = repairFlowMapMisparse(nested)
    }
    return repaired
  }
  return value
}
