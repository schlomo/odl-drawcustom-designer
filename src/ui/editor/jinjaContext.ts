import type { CompletionContext } from '@codemirror/autocomplete'

export function isInTemplateCapableYamlValue(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos)
  const lineBefore = context.state.sliceDoc(line.from, context.pos)

  const doubleQuotes = (lineBefore.match(/(?<!\\)"/g) ?? []).length
  if (doubleQuotes % 2 === 1) {
    return true
  }

  const singleQuotes = (lineBefore.match(/(?<!\\)'/g) ?? []).length
  if (singleQuotes % 2 === 1) {
    return true
  }

  const lineText = line.text
  if (/^\s*-\s*\S/.test(lineText)) {
    return false
  }

  return /^\s+\w[\w_]*:\s+[^\s#]/.test(lineBefore)
}

export function isAtLoneOpenBrace(context: CompletionContext): boolean {
  const before = context.state.sliceDoc(0, context.pos)
  if (!before.endsWith('{')) {
    return false
  }
  if (before.endsWith('{{') || before.endsWith('{%')) {
    return false
  }
  return isInTemplateCapableYamlValue(context)
}

function isBetweenMarkers(doc: string, pos: number, open: string, close: string): boolean {
  const before = doc.slice(0, pos)
  const start = before.lastIndexOf(open)
  if (start < 0) {
    return false
  }

  const segment = doc.slice(start + open.length, pos)
  return !segment.includes(close)
}

export function isInsideJinjaTemplate(context: CompletionContext): boolean {
  const doc = context.state.doc.toString()
  const { pos } = context

  return (
    isBetweenMarkers(doc, pos, '{{', '}}') || isBetweenMarkers(doc, pos, '{%', '%}')
  )
}

export function isAtJinjaTemplateStart(context: CompletionContext): boolean {
  const before = context.state.sliceDoc(0, context.pos)
  return /(?:\{\{|\{%)\s*$/.test(before)
}
