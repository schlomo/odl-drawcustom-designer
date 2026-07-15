import { isSeq, parseDocument } from 'yaml'
import type { YAMLSeq } from 'yaml'

/**
 * Single source of truth for element-index <-> source-offset mapping.
 *
 * Backed by the real YAML parser's AST node ranges (`yaml`'s `parseDocument`),
 * not a regex line scanner — so it agrees with `parseYamlPayload` by
 * construction for block style, flow style, comments, blank lines, and
 * multi-line (block scalar) strings.
 */
export interface ElementSpan {
  /** Position of this element in the top-level array. */
  index: number
  /** Start offset (inclusive) of the element's own source text. */
  start: number
  /** End offset (exclusive, except for the last element) of the element's own source text. */
  end: number
}

interface RangedNode {
  range?: [number, number, number]
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
}

function topLevelSequence(source: string): YAMLSeq | null {
  let doc: ReturnType<typeof parseDocument>
  try {
    doc = parseDocument(source)
  } catch {
    return null
  }

  const { contents } = doc
  return contents != null && isSeq(contents) ? contents : null
}

/**
 * AST-backed element spans for the top-level YAML array of drawcustom elements.
 *
 * - Block style (`- type: …`): span starts at the line containing the item
 *   (i.e. at the `-` marker), so it agrees with cursor/scroll positions.
 * - Flow style (`[{...}, {...}]`): span covers exactly the item's own value.
 * - Comments and blank lines between items belong to neither element — they
 *   fall in the gap between one element's `end` and the next element's `start`.
 * - The last element's `end` extends to the end of the document.
 */
export function findElementSpans(source: string): ElementSpan[] {
  const seq = topLevelSequence(source)
  if (!seq) {
    return []
  }

  const items = seq.items
  const spans: ElementSpan[] = []

  items.forEach((item, index) => {
    const range = (item as RangedNode | null)?.range
    if (!range) {
      return
    }

    const isLast = index === items.length - 1
    const start = seq.flow ? range[0] : lineStart(source, range[0])
    const end = isLast ? source.length : range[2]

    spans.push({ index, start, end })
  })

  return spans
}

/** Element index containing `offset`, or `null` if it falls outside every element
 * (before the first element, or in a comment/blank-line gap between elements). */
export function elementIndexAtOffset(source: string, offset: number): number | null {
  if (offset < 0) {
    return null
  }

  const spans = findElementSpans(source)
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]
    if (!span) {
      continue
    }

    const isLast = i === spans.length - 1
    const inSpan = offset >= span.start && (isLast ? offset <= span.end : offset < span.end)
    if (inSpan) {
      return span.index
    }
  }

  return null
}
