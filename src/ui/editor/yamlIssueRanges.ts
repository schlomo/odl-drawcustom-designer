import type { ZodIssue } from 'zod'
import { findElementSpans, type ElementSpan } from '../../core'

export interface SourceRange {
  from: number
  to: number
}

type ListItemSpan = ElementSpan

function lineOffset(lines: string[], lineIndex: number): number {
  let offset = 0
  for (let index = 0; index < lineIndex; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1
  }
  return offset
}

/**
 * Thin wrapper over the AST-backed mapping in `src/core/yaml/elementSpans.ts`
 * (single source of truth per issue #16). Retained under this name/shape for
 * the diagnostics helpers below and their existing callers.
 */
export function findListItemSpans(doc: string): ListItemSpan[] {
  return findElementSpans(doc)
}

export type FieldRangeHighlight = 'key' | 'value'

export function findFieldRange(
  doc: string,
  blockStart: number,
  blockEnd: number,
  fieldName: string,
  highlight: FieldRangeHighlight = 'value',
): SourceRange | null {
  const block = doc.slice(blockStart, blockEnd)
  const fieldPattern = new RegExp(
    `(^|\\n)(\\s*-?\\s*)(${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}):\\s*([^\\n]*)`,
    'm',
  )
  const match = fieldPattern.exec(block)
  if (!match) {
    return null
  }

  const value = match[4] ?? ''
  const matchStart = blockStart + (match.index ?? 0) + match[0].indexOf(match[3]!)
  const keyStart = matchStart
  const keyEnd = keyStart + fieldName.length
  const valueStart = blockStart + (match.index ?? 0) + match[0].indexOf(value)
  const valueEnd = valueStart + value.length

  if (highlight === 'key') {
    return { from: keyStart, to: Math.max(keyEnd, keyStart + 1) }
  }

  if (value.trim().length > 0) {
    return { from: valueStart, to: Math.max(valueEnd, valueStart + 1) }
  }

  return { from: keyStart, to: Math.max(keyEnd, keyStart + 1) }
}

export function locateZodPathInYaml(doc: string, path: PropertyKey[]): SourceRange | null {
  if (path.length === 0) {
    return null
  }

  const listItems = findListItemSpans(doc)
  let blockStart = 0
  let blockEnd = doc.length
  let remaining = [...path]

  if (typeof remaining[0] === 'number') {
    const item = listItems[remaining[0]]
    if (!item) {
      return null
    }
    blockStart = item.start
    blockEnd = item.end
    remaining = remaining.slice(1)
  }

  if (remaining.length === 0) {
    return { from: blockStart, to: blockEnd }
  }

  const fieldName = String(remaining[remaining.length - 1])
  const fieldRange = findFieldRange(doc, blockStart, blockEnd, fieldName)
  if (fieldRange) {
    return fieldRange
  }

  return { from: blockStart, to: blockEnd }
}

export function locateParseErrorInYaml(doc: string, message: string): SourceRange {
  const lineMatch = message.match(/line (\d+)/i)
  if (!lineMatch) {
    return { from: 0, to: doc.length }
  }

  const lineIndex = Number(lineMatch[1]) - 1
  const lines = doc.split('\n')
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { from: 0, to: doc.length }
  }

  const from = lineOffset(lines, lineIndex)
  const line = lines[lineIndex] ?? ''
  return { from, to: from + line.length }
}

function extractUnrecognizedKey(message: string): string | null {
  const match = message.match(/Unrecognized key: "([^"]+)"/)
  return match?.[1] ?? null
}

function findFieldNamesInBlock(doc: string, blockStart: number, blockEnd: number): string[] {
  const block = doc.slice(blockStart, blockEnd)
  const names: string[] = []
  const pattern = /(?:^|\n)\s*-?\s*(\w+):/gm

  for (const match of block.matchAll(pattern)) {
    const name = match[1]
    if (name) {
      names.push(name)
    }
  }

  return names
}

function editDistance(left: string, right: string): number {
  const rows = left.length + 1
  const cols = right.length + 1
  const distances = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let row = 0; row < rows; row += 1) {
    distances[row]![0] = row
  }
  for (let col = 0; col < cols; col += 1) {
    distances[0]![col] = col
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1
      distances[row]![col] = Math.min(
        distances[row - 1]![col]! + 1,
        distances[row]![col - 1]! + 1,
        distances[row - 1]![col - 1]! + cost,
      )
    }
  }

  return distances[left.length]![right.length]!
}

function findClosestFieldName(
  doc: string,
  blockStart: number,
  blockEnd: number,
  target: string,
): string | null {
  let closest: string | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const name of findFieldNamesInBlock(doc, blockStart, blockEnd)) {
    if (name === 'type') {
      continue
    }

    const distance = editDistance(name, target)
    if (distance < closestDistance && distance <= 2) {
      closest = name
      closestDistance = distance
    }
  }

  return closest
}

function blockBoundsForIssue(doc: string, path: PropertyKey[]): { start: number; end: number } {
  const listItems = findListItemSpans(doc)
  if (typeof path[0] !== 'number') {
    return { start: 0, end: doc.length }
  }

  const item = listItems[path[0]]
  if (!item) {
    return { start: 0, end: doc.length }
  }

  return { start: item.start, end: item.end }
}

export function locateZodIssueInYaml(doc: string, issue: ZodIssue): SourceRange {
  const { start: blockStart, end: blockEnd } = blockBoundsForIssue(doc, issue.path)

  const unrecognizedKey = extractUnrecognizedKey(issue.message)
  if (unrecognizedKey) {
    const range = findFieldRange(doc, blockStart, blockEnd, unrecognizedKey, 'key')
    if (range) {
      return range
    }
  }

  if (issue.path.length >= 2) {
    const fieldName = String(issue.path[issue.path.length - 1])
    const fieldRange = findFieldRange(doc, blockStart, blockEnd, fieldName)
    if (fieldRange) {
      return fieldRange
    }

    const closestField = findClosestFieldName(doc, blockStart, blockEnd, fieldName)
    if (closestField) {
      const closestRange = findFieldRange(doc, blockStart, blockEnd, closestField, 'key')
      if (closestRange) {
        return closestRange
      }
    }

    const typeRange = findFieldRange(doc, blockStart, blockEnd, 'type')
    if (typeRange) {
      return typeRange
    }
  }

  if (issue.path.length === 1 && typeof issue.path[0] === 'number') {
    const typeRange = findFieldRange(doc, blockStart, blockEnd, 'type')
    if (typeRange) {
      return typeRange
    }
    return { from: blockStart, to: Math.min(blockStart + 1, blockEnd) }
  }

  const located = locateZodPathInYaml(doc, issue.path)
  if (located) {
    const spansWholeBlock =
      located.from === blockStart &&
      located.to === blockEnd &&
      issue.path.length >= 2
    if (!spansWholeBlock) {
      return located
    }
  }

  return { from: blockStart, to: blockEnd }
}
