import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'

/** Scalar kinds that get distinct syntax colors (not plain unquoted text). */
export type YamlScalarKind = 'bool' | 'null' | 'number'

/** `key: value` on one line (including list items `- type: text`). */
const LINE_KEY_VALUE =
  /^(\s*(?:-\s+)?[A-Za-z0-9_.-]+:\s*)([^#\n]+?)\s*$/

const LINE_KEY = /^(\s*(?:-\s+)?)([A-Za-z0-9_.-]+)(:)/

/** `key: |-`, `key: >`, `key: |2`, etc. */
const BLOCK_SCALAR_INDICATOR =
  /^(\s*(?:-\s+)?[A-Za-z0-9_.-]+:\s*)([>|])([-+]?)(\d*)\s*$/

/** Classify unquoted YAML scalar literals (values, not mapping keys). */
export function classifyYamlScalar(text: string): YamlScalarKind | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return 'bool'
  }
  if (trimmed === 'null' || trimmed === '~') {
    return 'null'
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return 'number'
  }
  if (/^-?0x[0-9a-fA-F]+$/.test(trimmed)) {
    return 'number'
  }
  return null
}

export function keyRangeOnLine(
  lineText: string,
  lineFrom: number,
): { from: number; to: number } | null {
  const match = lineText.match(LINE_KEY)
  if (!match) {
    return null
  }
  const from = lineFrom + match[1]!.length
  return { from, to: from + match[2]!.length }
}

export function scalarValueRangeOnLine(
  lineText: string,
  lineFrom: number,
): { from: number; to: number; kind: YamlScalarKind } | null {
  const match = lineText.match(LINE_KEY_VALUE)
  if (!match) {
    return null
  }

  const rawValue = match[2] ?? ''
  const trimmed = rawValue.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (/^['"`[{>|]/.test(trimmed) || trimmed.endsWith(':')) {
    return null
  }

  const kind = classifyYamlScalar(trimmed)
  if (!kind) {
    return null
  }

  const leadingPad = rawValue.length - rawValue.trimStart().length
  const from = lineFrom + match[1]!.length + leadingPad
  const to = from + trimmed.length
  return { from, to, kind }
}

export function blockScalarIndicatorRangeOnLine(
  lineText: string,
  lineFrom: number,
): { from: number; to: number } | null {
  const match = lineText.match(BLOCK_SCALAR_INDICATOR)
  if (!match) {
    return null
  }
  const from = lineFrom + match[1]!.length
  const indicator = `${match[2] ?? ''}${match[3] ?? ''}${match[4] ?? ''}`
  return { from, to: from + indicator.length }
}

const keyMark = Decoration.mark({ class: 'cm-yamlKey' })
const blockIndicatorMark = Decoration.mark({ class: 'cm-yamlBlockIndicator' })

const scalarMark: Record<YamlScalarKind, Decoration> = {
  bool: Decoration.mark({ class: 'cm-yamlScalarBool' }),
  null: Decoration.mark({ class: 'cm-yamlScalarNull' }),
  number: Decoration.mark({ class: 'cm-yamlScalarNumber' }),
}

interface LineDecoration {
  from: number
  to: number
  mark: Decoration
}

function lineDecorations(lineText: string, lineFrom: number): LineDecoration[] {
  const decorations: LineDecoration[] = []

  const key = keyRangeOnLine(lineText, lineFrom)
  if (key) {
    decorations.push({ ...key, mark: keyMark })
  }

  const blockIndicator = blockScalarIndicatorRangeOnLine(lineText, lineFrom)
  if (blockIndicator) {
    decorations.push({ ...blockIndicator, mark: blockIndicatorMark })
  }

  const scalar = scalarValueRangeOnLine(lineText, lineFrom)
  if (scalar) {
    decorations.push({
      from: scalar.from,
      to: scalar.to,
      mark: scalarMark[scalar.kind],
    })
  }

  return decorations.sort((left, right) => left.from - right.from)
}

function buildScalarDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const all: LineDecoration[] = []

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)
    all.push(...lineDecorations(line.text, line.from))
  }

  for (const entry of all) {
    builder.add(entry.from, entry.to, entry.mark)
  }

  return builder.finish()
}

/** Line-based classical YAML colors for keys and bool/number/null values.
 *  Quoted strings (incl. Jinja templates) keep parser highlighting. */
export function yamlScalarHighlight() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildScalarDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildScalarDecorations(update.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}
