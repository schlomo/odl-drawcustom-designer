import { closeBrackets } from '@codemirror/autocomplete'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** `()`/`[]`/`'"/'"` auto-close; `{`/`}` handled by Jinja delimiter scaffolding. */
export const YAML_AUTO_CLOSE_BRACKETS = ['(', '[', "'", '"'] as const

const yamlCloseBracketsConfig = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: [...YAML_AUTO_CLOSE_BRACKETS] } },
])

export function yamlCloseBrackets() {
  return [yamlCloseBracketsConfig, closeBrackets()]
}

export const JINJA_DELIMITER_INSERTS = {
  '{{': '{ }}',
  '{%': '% %}',
} as const

export function jinjaDelimiterOpenTransaction(pos: number, open: '{{' | '{%'): TransactionSpec {
  if (open === '{{') {
    return {
      changes: { from: pos, insert: JINJA_DELIMITER_INSERTS['{{'] },
      selection: { anchor: pos + 1 },
      scrollIntoView: true,
      userEvent: 'input.type',
    }
  }

  return {
    changes: { from: pos, insert: JINJA_DELIMITER_INSERTS['{%'] },
    selection: { anchor: pos + 1 },
    scrollIntoView: true,
    userEvent: 'input.type',
  }
}

/**
 * Completes Jinja delimiters when typed manually:
 * `{` + `{` → `{{ }}` with the cursor inside
 * `{` + `%` → `{% %}` with the cursor inside
 */
export function jinjaBraceInputHandler() {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (view.state.readOnly || text.length !== 1 || from !== to) {
      return false
    }

    const pos = from
    const prev = view.state.doc.sliceString(Math.max(0, pos - 1), pos)

    if (text === '{' && prev === '{') {
      view.dispatch(jinjaDelimiterOpenTransaction(pos, '{{'))
      return true
    }

    if (text === '%' && prev === '{') {
      view.dispatch(jinjaDelimiterOpenTransaction(pos, '{%'))
      return true
    }

    return false
  })
}
