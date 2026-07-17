import { parseYamlPayload, validatePayload, type DrawElement } from '../../core'
import { moveElementInArray } from '../lib/element-geometry'
import { remapIndexAfterMove } from '../lib/selection-remap'

/** Recursively sort object keys so element comparison is order-stable without YAML round-trips. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key])
    }
    return sorted
  }
  return value
}

/** Stable structural signature for a draw element (fast path for sync comparisons). */
export function stableElementSignature(element: DrawElement): string {
  return JSON.stringify(sortKeysDeep(element))
}

function elementsAtIndexEquivalent(
  left: DrawElement[],
  right: DrawElement[],
  index: number,
): boolean {
  return stableElementSignature(left[index]!) === stableElementSignature(right[index]!)
}

export interface YamlElementsParseIssue {
  path: string
  message: string
}

export function getYamlElementsParseIssues(source: string): YamlElementsParseIssue[] {
  if (!source.trim()) {
    return []
  }

  try {
    const parsed = parseYamlPayload(source)
    const result = validatePayload(parsed)
    if (result.success) {
      return []
    }

    return result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : 'payload',
      message: issue.message,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML'
    return [{ path: 'yaml', message }]
  }
}

export function summarizeYamlElementsParseIssues(issues: YamlElementsParseIssue[]): string | null {
  if (issues.length === 0) {
    return null
  }

  const first = issues[0]!
  const label = first.path === 'payload' ? 'Payload' : first.path
  const lead = `${label}: ${first.message}`
  if (issues.length === 1) {
    return lead
  }

  return `${issues.length} validation errors — ${lead}`
}

export function tryParseYamlElements(source: string): DrawElement[] | null {
  if (!source.trim()) {
    return []
  }

  try {
    const parsed = parseYamlPayload(source)
    const result = validatePayload(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * True while the live editor document currently fails to parse or validate
 * (issue #35) — `tryParseYamlElements` returns `null` for both a YAML syntax
 * error and a schema validation failure, and `elements` stays frozen at its
 * last-valid state in either case. Visual editing (canvas + property panel)
 * is blocked for as long as this holds; the YAML editor itself stays active
 * since it is the only surface that can fix the document.
 */
export function isYamlDocBlocked(source: string): boolean {
  return tryParseYamlElements(source) === null
}

export function elementsSequenceEqual(left: DrawElement[], right: DrawElement[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!elementsAtIndexEquivalent(left, right, index)) {
      return false
    }
  }
  return true
}

function findSingleLayerMove(
  previousElements: DrawElement[],
  nextElements: DrawElement[],
): { fromIndex: number; toIndex: number } | null {
  if (previousElements.length !== nextElements.length || previousElements.length === 0) {
    return null
  }

  for (let fromIndex = 0; fromIndex < previousElements.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < nextElements.length; toIndex += 1) {
      if (fromIndex === toIndex) {
        continue
      }
      const candidate = moveElementInArray(previousElements, fromIndex, toIndex)
      if (elementsSequenceEqual(candidate, nextElements)) {
        return { fromIndex, toIndex }
      }
    }
  }

  return null
}

/**
 * Element index to focus in YAML after `elements` changes but `selectedIndex` may still be stale
 * (e.g. layer reorder committed before selection state updates).
 */
export function resolveLinkedElementIndex(
  previousElements: DrawElement[],
  nextElements: DrawElement[],
  selectedIndex: number | null,
): number | null {
  if (selectedIndex == null) {
    return null
  }
  return remapSelectedIndex(previousElements, nextElements, selectedIndex) ?? selectedIndex
}

export function remapSelectedIndex(
  previousElements: DrawElement[],
  nextElements: DrawElement[],
  selectedIndex: number | null,
): number | null {
  if (selectedIndex == null) {
    return null
  }

  const selected = previousElements[selectedIndex]
  if (!selected) {
    return null
  }

  // Single property edit at the selected index (canvas / property panel / YAML).
  if (nextElements.length === previousElements.length) {
    const changedIndices: number[] = []
    for (let i = 0; i < previousElements.length; i += 1) {
      if (!elementsAtIndexEquivalent(previousElements, nextElements, i)) {
        changedIndices.push(i)
      }
    }
    if (changedIndices.length === 1 && changedIndices[0] === selectedIndex) {
      return selectedIndex
    }
  }

  const layerMove = findSingleLayerMove(previousElements, nextElements)
  if (layerMove) {
    return remapIndexAfterMove(selectedIndex, layerMove.fromIndex, layerMove.toIndex)
  }

  const selectedSignature = stableElementSignature(selected)
  const exactMatch = nextElements.findIndex(
    (element) => stableElementSignature(element) === selectedSignature,
  )
  if (exactMatch >= 0) {
    return exactMatch
  }

  return null
}

export function shouldApplyExternalYamlSync(skipBecauseYamlEdit: boolean): boolean {
  return !skipBecauseYamlEdit
}
