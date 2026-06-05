import { findListItemSpans } from './yamlIssueRanges'

export function locateElementStartInYaml(doc: string, elementIndex: number): number | null {
  if (elementIndex < 0) {
    return null
  }

  const spans = findListItemSpans(doc)
  return spans[elementIndex]?.start ?? null
}

/** Cursor position for linked scroll: end of the element header line, not document offset 0. */
export function locateElementFocusInYaml(doc: string, elementIndex: number): number | null {
  const start = locateElementStartInYaml(doc, elementIndex)
  if (start == null) {
    return null
  }

  const lineBreak = doc.indexOf('\n', start)
  if (lineBreak < 0) {
    return doc.length
  }

  const firstLine = doc.slice(start, lineBreak)
  const typeMatch = firstLine.match(/\btype:\s*(.*)$/)
  if (typeMatch) {
    const value = typeMatch[1] ?? ''
    if (value.trim().length > 0) {
      return lineBreak
    }

    const typeColon = firstLine.indexOf('type:')
    if (typeColon >= 0) {
      const afterColon = start + typeColon + 'type:'.length
      const trailingSpace = firstLine.slice(typeColon + 'type:'.length).match(/^\s*/)?.[0]?.length ?? 0
      return afterColon + trailingSpace
    }
  }

  return lineBreak
}

export function locateElementIndexAtPosition(doc: string, pos: number): number | null {
  if (pos < 0) {
    return null
  }

  const spans = findListItemSpans(doc)
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index]
    if (!span) {
      continue
    }

    const isLast = index === spans.length - 1
    const inSpan = pos >= span.start && (isLast ? pos <= span.end : pos < span.end)
    if (inSpan) {
      return span.index
    }
  }

  return null
}

export function getListItemBlockAtPosition(doc: string, pos: number): string {
  const spans = findListItemSpans(doc)
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index]
    if (!span) {
      continue
    }

    const isLast = index === spans.length - 1
    const inSpan = pos >= span.start && (isLast ? pos <= span.end : pos < span.end)
    if (inSpan) {
      return doc.slice(span.start, span.end)
    }
  }

  return ''
}
