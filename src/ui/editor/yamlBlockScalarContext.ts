import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { parse as parseYaml } from 'yaml'

const BLOCK_SCALAR_HEADER =
  /^(\s*)([A-Za-z0-9_.-]+):\s*([>|])([-+]?)(\d*)\s*$/

function isInsideYamlBlockScalarSyntaxTree(state: EditorState, pos: number): boolean {
  try {
    const tree = syntaxTree(state)
    for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
      if (node.type.name === 'BlockLiteral' || node.type.name === 'BlockLiteralContent') {
        return true
      }
    }
  } catch {
    // Unit-test mocks and uninitialized parser states fall back to line heuristics.
  }
  return false
}

export function isInsideYamlBlockScalarContent(state: EditorState, pos: number): boolean {
  if (isInsideYamlBlockScalarSyntaxTree(state, pos)) {
    return true
  }
  return isInsideYamlBlockScalarContentByLine(state, pos)
}

function isInsideYamlBlockScalarContentByLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  const lineIndent = line.text.match(/^(\s*)/)?.[1]?.length ?? 0
  if (lineIndent < 4) {
    return false
  }

  if (/^\s+\w[\w_]*:\s*/.test(line.text)) {
    return false
  }

  for (let lineNo = line.number - 1; lineNo >= 1; lineNo -= 1) {
    const previous = state.doc.line(lineNo)
    if (BLOCK_SCALAR_HEADER.test(previous.text)) {
      const headerIndent = previous.text.match(/^(\s*)/)?.[1]?.length ?? 0
      return lineIndent > headerIndent
    }

    const previousIndent = previous.text.match(/^(\s*)/)?.[1]?.length ?? 0
    if (previous.text.trim() !== '' && previousIndent < lineIndent) {
      return false
    }
  }

  return false
}

export interface YamlBlockScalarRegion {
  key: string
  /** Document position after the last line of block content (widget anchor). */
  valueEnd: number
  value: string
}

/** Extract parsed block scalar values from YAML source (literal or folded). */
export function findYamlBlockScalarRegions(doc: string): YamlBlockScalarRegion[] {
  const regions: YamlBlockScalarRegion[] = []
  const lineStarts: number[] = []
  let offset = 0
  for (const line of doc.split('\n')) {
    lineStarts.push(offset)
    offset += line.length + 1
  }

  const lines = doc.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const headerMatch = line.match(BLOCK_SCALAR_HEADER)
    if (!headerMatch) {
      continue
    }

    const baseIndent = headerMatch[1]!.length
    const key = headerMatch[2]!
    const indicator = `${headerMatch[3]!}${headerMatch[4] ?? ''}`
    const contentIndent = baseIndent + 2
    const contentLines: string[] = []
    let lastContentLine = index
    let cursor = index + 1

    while (cursor < lines.length) {
      const contentLine = lines[cursor] ?? ''
      const lineIndent = contentLine.match(/^(\s*)/)?.[1]?.length ?? 0

      if (contentLine.trim() === '' && lineIndent > baseIndent) {
        contentLines.push('')
        lastContentLine = cursor
        cursor += 1
        continue
      }

      if (contentLine.trim() !== '' && lineIndent <= baseIndent) {
        break
      }

      if (lineIndent >= contentIndent) {
        contentLines.push(contentLine.slice(contentIndent))
        lastContentLine = cursor
        cursor += 1
        continue
      }

      if (contentLine.trim() === '') {
        lastContentLine = cursor
        cursor += 1
        continue
      }

      break
    }

    const headerYaml = `${' '.repeat(baseIndent)}${key}: ${indicator}\n`
    const bodyYaml =
      contentLines.map((entry) => `${' '.repeat(contentIndent)}${entry}`).join('\n') + '\n'

    try {
      const parsed = parseYaml(headerYaml + bodyYaml) as Record<string, unknown>
      const value = parsed[key]
      if (typeof value === 'string') {
        const lineStart = lineStarts[lastContentLine] ?? 0
        const lineText = lines[lastContentLine] ?? ''
        regions.push({
          key,
          valueEnd: lineStart + lineText.length,
          value,
        })
      }
    } catch {
      // ignore malformed blocks while typing
    }

    index = cursor - 1
  }

  return regions
}
