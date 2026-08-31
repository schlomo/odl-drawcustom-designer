import { Scalar, parseDocument, visit } from 'yaml'

/** A single/double-quoted YAML scalar whose PARSED value is available for
 * template extraction, keyed to a source position for widget placement. */
export interface YamlQuotedScalarRegion {
  /** Document position right after the scalar's closing quote (widget anchor). */
  valueEnd: number
  /** Parsed (YAML-unescaped) string value of the scalar. */
  value: string
}

const QUOTE_CHARS: Readonly<Record<string, string>> = {
  [Scalar.QUOTE_SINGLE]: "'",
  [Scalar.QUOTE_DOUBLE]: '"',
}

interface RangedScalarNode {
  value: unknown
  type?: string
  range?: [number, number, number] | null
}

/** Characters that may legitimately follow a closing quote: end of input,
 * whitespace, or a YAML structural character. Anything else means the
 * "closing" quote isn't a real boundary — see {@link isScalarQuoteClosed}. */
const VALID_FOLLOWING_CHAR = /[\s:,}\]#]/

/**
 * Whether `node`'s own quote pair is genuinely closed in `source`, as
 * opposed to a scalar the YAML parser truncated while recovering from
 * mid-typed input (F1, review of #172). Two independent, unrelated failure
 * shapes both need catching:
 *
 * - **Missing close** — no closing quote before input runs out at all
 *   (`value: "{{ states('sensor.a`). The parser reads to the end of input
 *   and calls that the scalar; nothing at `valueEnd - 1` is the opening
 *   quote character.
 * - **Early close** — a *single*, undoubled quote inside a single-quoted
 *   scalar is itself valid YAML: it closes the string right there (that's
 *   the other half of the `''`-doubling rule this file exists for). Typing
 *   the escape one quote at a time (`states('sensor.a`, the first quote of
 *   an eventual `''` pair) leaves a syntactically closed but truncated
 *   scalar with ordinary text glued on immediately after — caught by
 *   requiring whatever follows the closing quote to be end-of-input,
 *   whitespace, or a YAML structural character, never a bareword character.
 */
function isScalarQuoteClosed(source: string, range: [number, number, number], quote: string): boolean {
  const [start, valueEnd] = range
  if (valueEnd - start < 2 || source[start] !== quote || source[valueEnd - 1] !== quote) {
    return false
  }
  const following = source[valueEnd]
  return following === undefined || VALID_FOLLOWING_CHAR.test(following)
}

function computeQuotedScalarRegions(source: string): YamlQuotedScalarRegion[] {
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
      const quote = node.type ? QUOTE_CHARS[node.type] : undefined
      if (!quote) {
        return
      }
      const range = node.range
      if (!range) {
        return
      }
      if (!isScalarQuoteClosed(source, range, quote)) {
        return
      }

      const [start, valueEnd] = range
      if (source.slice(start, valueEnd).includes('\n')) {
        return
      }

      regions.push({ valueEnd, value: node.value })
    },
  })

  return regions
}

// Inline preview reruns on every keystroke AND on every `now()` tick, the
// latter with the document text unchanged — a full `parseDocument` is the
// only per-keystroke whole-document parse in the editor, so a single
// last-value memo (same shape as `elementSpans.ts`'s cache) skips the AST
// walk entirely when the tick is what changed, not the text.
let lastSource: string | null = null
let lastRegions: YamlQuotedScalarRegion[] = []

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
 * `yaml`'s parser recovers from *some* local syntax problems without
 * throwing — e.g. two key/value pairs crammed onto one physical line still
 * yields correctly-valued scalar nodes for the parts it can make sense of,
 * same for a duplicate key. Recovery is NOT a general safety net, though:
 * an indentation error (e.g. a tab-indented key) can drop the affected
 * key's own scalar from the walk entirely rather than degrade gracefully —
 * `parseDocument` still returns without throwing, but the scalar the user
 * is looking at simply isn't there to find, so a document whose only
 * template is inside a badly-indented key can yield zero regions. Absence
 * of a thrown error is therefore not proof every visible scalar survived
 * the walk. Separately, a scalar whose OWN quote pair the parser had to
 * truncate to keep going is deliberately excluded regardless of
 * `doc.errors` (see {@link isScalarQuoteClosed}) rather than trusted
 * because parsing didn't throw.
 *
 * A scalar whose own source text (start to closing quote) spans multiple
 * physical lines is skipped, matching prior behavior — YAML line-folding can
 * collapse such a scalar's PARSED value onto one line even though the user's
 * source spans several, so multi-line quoted flow scalars still don't get an
 * inline widget. Multi-line templates use block literal/folded scalars
 * instead, handled separately (`findYamlBlockScalarRegions`).
 */
export function findYamlQuotedScalarRegions(source: string): YamlQuotedScalarRegion[] {
  if (source !== lastSource) {
    lastRegions = computeQuotedScalarRegions(source)
    lastSource = source
  }
  return lastRegions
}
