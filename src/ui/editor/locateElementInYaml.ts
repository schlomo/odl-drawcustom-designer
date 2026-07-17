import { elementIndexAtOffset, findElementSpans } from '../../core'

export function locateElementStartInYaml(doc: string, elementIndex: number): number | null {
  if (elementIndex < 0) {
    return null
  }

  const spans = findElementSpans(doc)
  return spans[elementIndex]?.start ?? null
}

/** Cursor position for linked scroll: end of the element header line, not document offset 0. */
export function locateElementFocusInYaml(doc: string, elementIndex: number): number | null {
  const span = findElementSpans(doc)[elementIndex]
  if (!span) {
    return null
  }

  const { start } = span
  // Bound the "header line" search to this element's own span so a flow-style
  // element (which may share a physical line with sibling elements, or have no
  // newline at all) never borrows a position from the next element or the tail
  // of the document (issue #15).
  const searchEnd = Math.min(span.end, doc.length)
  const relativeLineBreak = doc.slice(start, searchEnd).indexOf('\n')
  const lineBreak = relativeLineBreak >= 0 ? start + relativeLineBreak : searchEnd

  const firstLine = doc.slice(start, lineBreak)
  const typeMatch = firstLine.match(/\btype:\s*([^,}\n]*)/)
  if (typeMatch) {
    const value = typeMatch[1] ?? ''
    if (value.trim().length > 0) {
      return start + (typeMatch.index ?? 0) + typeMatch[0].length
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
  return elementIndexAtOffset(doc, pos)
}

export function getListItemBlockAtPosition(doc: string, pos: number): string {
  const spans = findElementSpans(doc)
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
