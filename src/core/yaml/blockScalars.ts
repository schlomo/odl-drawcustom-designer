import { Document, isMap, isPair, Scalar, visit } from 'yaml'
import type { DrawElement } from '../schema/elements'

/** Minimum length before a single-line string uses a folded block scalar (`>-`). */
export const BLOCK_FOLDED_MIN_LENGTH = 80

/** Wrap width passed to `Document.toString()` for folded block bodies. */
export const YAML_SERIALIZE_LINE_WIDTH = 80

export type YamlBlockScalarType = 'BLOCK_LITERAL' | 'BLOCK_FOLDED'

export interface BlockScalarContext {
  fieldKey?: string
  elementType?: string
  delimiter?: string
}

/** True when a string likely contains a Home Assistant / Jinja template expression. */
export function containsJinjaTemplate(value: string): boolean {
  return value.includes('{{') || value.includes('{%')
}

/**
 * Split a single-line value into folded block lines at delimiter boundaries.
 * Continuation lines keep the delimiter at column 0 (e.g. `/Assistant`).
 */
export function foldLinesAtDelimiter(value: string, delimiter: string): string[] {
  if (!value.includes(delimiter)) {
    return [value]
  }

  const lines: string[] = []
  let rest = value
  while (rest.length > 0) {
    const index = rest.indexOf(delimiter)
    if (index === -1) {
      lines.push(rest)
      break
    }
    if (index === 0) {
      const nextIndex = rest.indexOf(delimiter, delimiter.length)
      if (nextIndex === -1) {
        lines.push(rest)
        break
      }
      lines.push(rest.slice(0, nextIndex).trimEnd())
      rest = rest.slice(nextIndex)
      continue
    }
    lines.push(rest.slice(0, index).trimEnd())
    rest = rest.slice(index)
  }
  return lines
}

/** True when `>-` line breaks can be reflowed without changing the parsed value. */
export function multilineFoldsSafely(value: string, delimiter: string): boolean {
  return value.includes(` ${delimiter}`) || value.length >= BLOCK_FOLDED_MIN_LENGTH
}

/** Split a folded Jinja template onto separate YAML lines (statements vs expressions). */
export function foldLinesForJinjaTemplate(value: string): string[] {
  const segments = value
    .split(/\s+(?=(?:{{|{%))/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  return segments.length > 0 ? segments : [value]
}

/** Choose `|-` / `|` vs `>-` / `>` for a string value, or null to keep default quoting. */
export function stringBlockScalarType(
  value: unknown,
  context: BlockScalarContext = {},
): YamlBlockScalarType | null {
  if (typeof value !== 'string') {
    return null
  }
  if (value.includes('\n') || value.includes('\r')) {
    return Scalar.BLOCK_LITERAL
  }
  if (value.includes('{%')) {
    return Scalar.BLOCK_FOLDED
  }
  if (value.includes('{{')) {
    return Scalar.BLOCK_LITERAL
  }
  const delimiter = context.delimiter ?? '|'
  if (
    context.elementType === 'multiline' &&
    multilineFoldsSafely(value, delimiter) &&
    foldLinesAtDelimiter(value, delimiter).length > 1
  ) {
    return Scalar.BLOCK_FOLDED
  }
  if (value.length >= BLOCK_FOLDED_MIN_LENGTH) {
    return Scalar.BLOCK_FOLDED
  }
  return null
}

export function applyBlockScalarTypes(doc: Document): void {
  visit(doc, {
    Scalar(_key, node, path) {
      const pair = path[path.length - 1]
      if (!isPair(pair) || pair.value !== node) {
        return
      }

      const pairKey = pair.key
      const fieldKey =
        pairKey instanceof Scalar && typeof pairKey.value === 'string'
          ? pairKey.value
          : undefined
      const parentMap = path[path.length - 2]
      const elementType =
        isMap(parentMap) && typeof parentMap.get('type') === 'string'
          ? (parentMap.get('type') as string)
          : undefined
      const delimiter =
        isMap(parentMap) && typeof parentMap.get('delimiter') === 'string'
          ? (parentMap.get('delimiter') as string)
          : undefined

      const blockType = stringBlockScalarType(node.value, {
        fieldKey,
        elementType,
        delimiter,
      })
      if (!blockType) {
        return
      }
      node.type = blockType
    },
  })
}

function reflowFoldedScalarBody(
  yaml: string,
  fieldKey: string,
  value: string,
  lines: string[],
): string {
  if (lines.length <= 1) {
    return yaml
  }

  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(  ${fieldKey}: >-?\\n)( {4})${escaped}`)
  if (!pattern.test(yaml)) {
    return yaml
  }

  return yaml.replace(pattern, (_match, header: string, indent: string) => {
    return header + lines.map((line) => indent + line).join('\n')
  })
}

function collectTemplatedStringFields(element: DrawElement): Array<{ key: string; value: string }> {
  const fields: Array<{ key: string; value: string }> = []
  for (const [key, raw] of Object.entries(element)) {
    if (typeof raw === 'string' && raw.includes('{%')) {
      fields.push({ key, value: raw })
    }
  }
  return fields
}

/** Reflow folded block bodies for readable export YAML (multiline delimiters, Jinja statements). */
export function prettifyFoldedBlockScalars(yaml: string, elements: DrawElement[]): string {
  let result = yaml

  for (const element of elements) {
    if (
      element.type === 'multiline' &&
      typeof element.value === 'string' &&
      multilineFoldsSafely(element.value, element.delimiter)
    ) {
      const lines = foldLinesAtDelimiter(element.value, element.delimiter)
      result = reflowFoldedScalarBody(result, 'value', element.value, lines)
    }

    for (const field of collectTemplatedStringFields(element)) {
      const lines = foldLinesForJinjaTemplate(field.value)
      result = reflowFoldedScalarBody(result, field.key, field.value, lines)
    }
  }

  return result
}

/** @deprecated Use {@link prettifyFoldedBlockScalars}. */
export function prettifyMultilineFoldedBlocks(
  yaml: string,
  elements: DrawElement[],
): string {
  return prettifyFoldedBlockScalars(yaml, elements)
}
