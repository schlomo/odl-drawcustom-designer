import { Scalar, parseDocument, visit } from 'yaml'

/** A single/double-quoted YAML scalar whose PARSED value is available for
 * template extraction, keyed to a source position for widget placement. */
export interface YamlQuotedScalarRegion {
  /** Document position right after the scalar's closing quote (widget anchor). */
  pos: number
  /** Parsed (YAML-unescaped) string value of the scalar. */
  value: string
}

const QUOTED_SCALAR_TYPES: ReadonlySet<string> = new Set([Scalar.QUOTE_SINGLE, Scalar.QUOTE_DOUBLE])

interface RangedScalarNode {
  value: unknown
  type?: string
  range?: [number, number, number] | null
}

/**
 * Finds every single/double-quoted YAML scalar in `source`, returning its
 * PARSED string value and the source offset just past its closing quote.
 *
 * Backed by the real YAML parser (`yaml`'s `parseDocument`/`visit`) — the
 * same parser `parseYamlPayload` uses — so YAML escaping is honored exactly:
 * single-quote doubling (`''`) and double-quote backslash escapes both
 * resolve correctly. This is the single source of truth for "what template
 * string does this quoted scalar actually contain", replacing a prior
 * raw-text regex that assumed backslash-escaping and had no notion of `''`
 * doubling — the escape style Home Assistant's automation editor emits for
 * single-quoted scalars (issue #168). A doubled-quote payload like
 * `'{{ states(''sensor.x'') }}'` made the regex slice a garbled, unbalanced
 * fragment and evaluating it threw deep inside the template compiler.
 *
 * `yaml`'s parser recovers from most local syntax problems (e.g. two
 * key/value pairs crammed onto one physical line while the user is mid-edit)
 * and still yields correctly-valued scalar nodes with usable ranges for the
 * text it CAN make sense of — `doc.errors` records the problem but parsing
 * doesn't throw, so a still-valid scalar elsewhere in a momentarily-broken
 * document keeps its preview.
 *
 * A scalar whose own source text (start to closing quote) spans multiple
 * physical lines is skipped, matching prior behavior — YAML line-folding can
 * collapse such a scalar's PARSED value onto one line even though the user's
 * source spans several, so multi-line quoted flow scalars still don't get an
 * inline widget. Multi-line templates use block literal/folded scalars
 * instead, handled separately (`findYamlBlockScalarRegions`).
 */
export function findYamlQuotedScalarRegions(source: string): YamlQuotedScalarRegion[] {
  let doc: ReturnType<typeof parseDocument>
  try {
    doc = parseDocument(source)
  } catch {
    return []
  }

  const regions: YamlQuotedScalarRegion[] = []

  visit(doc, {
    Scalar(_key, node: RangedScalarNode) {
      if (typeof node.value !== 'string') {
        return
      }
      if (!node.type || !QUOTED_SCALAR_TYPES.has(node.type)) {
        return
      }
      const range = node.range
      if (!range) {
        return
      }

      const [start, valueEnd] = range
      if (source.slice(start, valueEnd).includes('\n')) {
        return
      }

      regions.push({ pos: valueEnd, value: node.value })
    },
  })

  return regions
}
