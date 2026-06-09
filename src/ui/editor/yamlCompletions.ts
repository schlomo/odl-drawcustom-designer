import type { Completion } from '@codemirror/autocomplete'
import {
  BOOLEAN_PROPERTY_KEYS,
  DRAW_ELEMENT_TYPES,
  type CompletionEntry,
  getElementTypeCompletions,
  getElementTypeInsertion,
  getElementTypeInsertionForBlock,
  getEnumCompletions,
  getPropertyCompletions,
  isDrawElementType,
} from '../../core'
import { getListItemBlockAtPosition } from './locateElementInYaml'
import { listMdiIconNamesForCompletion } from '../lib/mdi-icon-names'

export type YamlCompletionContext =
  | { kind: 'element-type'; prefix?: string }
  | { kind: 'list-item-key'; prefix?: string }
  | { kind: 'property'; elementType: (typeof DRAW_ELEMENT_TYPES)[number]; prefix?: string }
  | { kind: 'enum'; enumName: 'color' | 'direction' | 'resize_method' | 'boolean'; prefix?: string }
  | { kind: 'icon-name'; prefix?: string }

type YamlEnumName = Extract<YamlCompletionContext, { kind: 'enum' }>['enumName']

const PROPERTY_ENUM_KEYS: Record<string, YamlEnumName> = {
  color: 'color',
  fill: 'color',
  outline: 'color',
  background: 'color',
  line_color: 'color',
  label_color: 'color',
  bgcolor: 'color',
  direction: 'direction',
  resize_method: 'resize_method',
}

const LIST_ITEM_KEYS: CompletionEntry[] = [
  { label: 'type', kind: 'property', detail: 'draw element type' },
]

export function inferCurrentElementType(
  doc: string,
  pos: number,
): (typeof DRAW_ELEMENT_TYPES)[number] | null {
  const before = doc.slice(0, pos)
  const lines = before.split('\n')

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? ''
    const typeMatch = line.match(/^\s*-?\s*type:\s*([a-z_]+)\s*$/)
    if (typeMatch) {
      const candidate = typeMatch[1]
      if (DRAW_ELEMENT_TYPES.includes(candidate as (typeof DRAW_ELEMENT_TYPES)[number])) {
        return candidate as (typeof DRAW_ELEMENT_TYPES)[number]
      }
    }
    if (/^-\s/.test(line) && !/\btype:/.test(line)) {
      return null
    }
  }

  return null
}

const ICON_NAME_QUERY = String.raw`[\w: -]*`

const ICON_NAME_VALUE_PATTERN = new RegExp(String.raw`^\s+value:\s*"?(${ICON_NAME_QUERY})$`)
const ICON_NAME_LIST_ITEM_PATTERN = new RegExp(String.raw`^\s+-\s*"?(${ICON_NAME_QUERY})$`)

export function isInIconSequenceIconsList(doc: string, pos: number): boolean {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = doc.indexOf('\n', pos)
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd)
  if (!ICON_NAME_LIST_ITEM_PATTERN.test(line)) {
    return false
  }

  const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0
  const lines = doc.slice(0, lineStart).split('\n')

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const prevLine = lines[index] ?? ''
    const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0

    if (/^\s+icons:\s*$/.test(prevLine) && prevIndent < currentIndent) {
      return true
    }

    if (prevIndent < currentIndent && /^\s+\w+:/.test(prevLine) && !/^\s+icons:\s*$/.test(prevLine)) {
      return false
    }

    if (/^-\s/.test(prevLine) && prevIndent < currentIndent && !/\btype:/.test(prevLine)) {
      return false
    }
  }

  return false
}

export function resolveYamlCompletionContext(
  lineBeforeCursor: string,
  elementType: (typeof DRAW_ELEMENT_TYPES)[number] | null,
  doc = '',
  pos = 0,
): YamlCompletionContext | null {
  const typeValueMatch = lineBeforeCursor.match(/^\s*-?\s*type:\s*(\w*)$/)
  if (typeValueMatch) {
    const prefix = typeValueMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'element-type' }
      : { kind: 'element-type', prefix }
  }

  const listItemKeyMatch = lineBeforeCursor.match(/^-\s+(\w*)$/)
  if (listItemKeyMatch && elementType === null) {
    const prefix = listItemKeyMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'list-item-key' }
      : { kind: 'list-item-key', prefix }
  }

  const propertyValueMatch = lineBeforeCursor.match(/^\s+(\w+):\s*"?(\w*)$/)
  if (propertyValueMatch) {
    const key = propertyValueMatch[1] ?? ''
    const prefix = propertyValueMatch[2]
    const enumName = PROPERTY_ENUM_KEYS[key]
    if (enumName) {
      return prefix === undefined || prefix.length === 0
        ? { kind: 'enum', enumName }
        : { kind: 'enum', enumName, prefix }
    }
    if (BOOLEAN_PROPERTY_KEYS.has(key)) {
      return prefix === undefined || prefix.length === 0
        ? { kind: 'enum', enumName: 'boolean' }
        : { kind: 'enum', enumName: 'boolean', prefix }
    }
  }

  const iconValueMatch = lineBeforeCursor.match(ICON_NAME_VALUE_PATTERN)
  if (elementType === 'icon' && iconValueMatch) {
    const prefix = iconValueMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'icon-name' }
      : { kind: 'icon-name', prefix }
  }

  const iconListMatch = lineBeforeCursor.match(ICON_NAME_LIST_ITEM_PATTERN)
  if (elementType === 'icon_sequence' && iconListMatch && isInIconSequenceIconsList(doc, pos)) {
    const prefix = iconListMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'icon-name' }
      : { kind: 'icon-name', prefix }
  }

  const propertyMatch = lineBeforeCursor.match(/^\s+(\w*)$/)
  if (elementType && propertyMatch) {
    const prefix = propertyMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'property', elementType }
      : { kind: 'property', elementType, prefix }
  }

  const propertyKeyMatch = lineBeforeCursor.match(/^\s+(\w+):\s*$/)
  if (elementType && propertyKeyMatch) {
    const prefix = propertyKeyMatch[1]
    return prefix === undefined || prefix.length === 0
      ? { kind: 'property', elementType }
      : { kind: 'property', elementType, prefix }
  }

  return null
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

function filterByPrefix(entries: CompletionEntry[], prefix?: string): CompletionEntry[] {
  if (!prefix) {
    return entries
  }

  const exact = entries.filter((entry) => entry.label.startsWith(prefix))
  if (exact.length > 0) {
    return exact
  }

  return entries
    .map((entry) => ({ entry, distance: editDistance(prefix, entry.label) }))
    .filter(({ distance }) => distance <= 2)
    .sort((left, right) => left.distance - right.distance)
    .map(({ entry }) => entry)
}

export function completionEntriesForContext(context: YamlCompletionContext): CompletionEntry[] {
  switch (context.kind) {
    case 'element-type':
      return filterByPrefix(getElementTypeCompletions(), context.prefix)
    case 'list-item-key':
      return filterByPrefix(LIST_ITEM_KEYS, context.prefix)
    case 'property':
      return filterByPrefix(getPropertyCompletions(context.elementType), context.prefix)
    case 'enum':
      return filterByPrefix(getEnumCompletions(context.enumName), context.prefix)
    case 'icon-name':
      return listMdiIconNamesForCompletion(context.prefix, 50).map((label) => ({
        label,
        kind: 'enum',
        detail: 'MDI icon',
      }))
    default:
      return []
  }
}

export function formatElementTypeApplyText(
  elementType: (typeof DRAW_ELEMENT_TYPES)[number],
  charBeforeFrom: string,
  existingBlock = '',
): string {
  const prefix = charBeforeFrom === ':' ? ' ' : ''
  const body = existingBlock.trim()
    ? getElementTypeInsertionForBlock(elementType, existingBlock)
    : getElementTypeInsertion(elementType)
  return `${prefix}${body}`
}

function toCodemirrorCompletion(
  entry: CompletionEntry,
  context: YamlCompletionContext,
): Completion {
  const completion: Completion = {
    label: entry.label,
    type: entry.kind,
    detail: entry.detail,
  }

  if (entry.kind === 'property') {
    completion.apply = `${entry.label}: `
  }

  if (context.kind === 'element-type' && entry.kind === 'type' && isDrawElementType(entry.label)) {
    const elementType = entry.label
    completion.apply = (view, _completion, from, to) => {
      const charBefore = from > 0 ? view.state.doc.sliceString(from - 1, from) : ''
      const existingBlock = getListItemBlockAtPosition(view.state.doc.toString(), from)
      const insertion = formatElementTypeApplyText(elementType, charBefore, existingBlock)
      view.dispatch({ changes: { from, to, insert: insertion } })
    }
  }

  return completion
}

export function completionsFromContext(context: YamlCompletionContext): Completion[] {
  return completionEntriesForContext(context).map((entry) => toCodemirrorCompletion(entry, context))
}
