import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { ResolvedTheme } from '../preferences/theme'

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#93c5fd' },
  { tag: tags.controlKeyword, color: '#93c5fd' },
  { tag: tags.operatorKeyword, color: '#cbd5e1' },
  { tag: tags.definitionKeyword, color: '#c4b5fd' },
  { tag: tags.modifier, color: '#a5b4fc' },
  { tag: tags.string, color: '#fde68a' },
  { tag: tags.special(tags.string), color: '#fde68a' },
  { tag: tags.number, color: '#fcd34d' },
  { tag: tags.bool, color: '#f9a8d4' },
  { tag: tags.null, color: '#f9a8d4' },
  { tag: tags.comment, color: '#94a3b8' },
  { tag: tags.propertyName, color: '#c4b5fd' },
  { tag: tags.definition(tags.propertyName), color: '#c4b5fd' },
  { tag: tags.variableName, color: '#7dd3fc' },
  { tag: tags.definition(tags.variableName), color: '#7dd3fc' },
  { tag: tags.special(tags.variableName), color: '#7dd3fc' },
  { tag: tags.function(tags.variableName), color: '#6ee7b7' },
  { tag: tags.standard(tags.variableName), color: '#a7f3d0' },
  { tag: tags.self, color: '#a7f3d0' },
  { tag: tags.logicOperator, color: '#cbd5e1' },
  { tag: tags.compareOperator, color: '#cbd5e1' },
  { tag: tags.operator, color: '#cbd5e1' },
  { tag: tags.punctuation, color: '#e2e8f0' },
  { tag: tags.brace, color: '#67e8f9' },
  { tag: tags.paren, color: '#e2e8f0' },
  { tag: tags.meta, color: '#94a3b8' },
])

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#1d4ed8' },
  { tag: tags.controlKeyword, color: '#1d4ed8' },
  { tag: tags.operatorKeyword, color: '#334155' },
  { tag: tags.definitionKeyword, color: '#6d28d9' },
  { tag: tags.modifier, color: '#4338ca' },
  { tag: tags.string, color: '#b45309' },
  { tag: tags.special(tags.string), color: '#b45309' },
  { tag: tags.number, color: '#a16207' },
  { tag: tags.bool, color: '#be185d' },
  { tag: tags.null, color: '#be185d' },
  { tag: tags.comment, color: '#64748b' },
  { tag: tags.propertyName, color: '#6d28d9' },
  { tag: tags.definition(tags.propertyName), color: '#6d28d9' },
  { tag: tags.variableName, color: '#0369a1' },
  { tag: tags.definition(tags.variableName), color: '#0369a1' },
  { tag: tags.special(tags.variableName), color: '#0369a1' },
  { tag: tags.function(tags.variableName), color: '#047857' },
  { tag: tags.standard(tags.variableName), color: '#047857' },
  { tag: tags.self, color: '#047857' },
  { tag: tags.logicOperator, color: '#334155' },
  { tag: tags.compareOperator, color: '#334155' },
  { tag: tags.operator, color: '#334155' },
  { tag: tags.punctuation, color: '#475569' },
  { tag: tags.brace, color: '#0e7490' },
  { tag: tags.paren, color: '#475569' },
  { tag: tags.meta, color: '#64748b' },
])

function editorChrome(theme: ResolvedTheme, fontSizePx: number) {
  const isDark = theme === 'dark'
  const selectionColor = isDark ? '#334155' : '#bfdbfe'

  return EditorView.theme(
    {
      '&': {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
      },
      '.cm-content': {
        caretColor: isDark ? '#f8fafc' : '#0f172a',
        fontFamily: MONO,
        fontSize: `${fontSizePx}px`,
        lineHeight: `${Math.round(fontSizePx * 1.55 * 100) / 100}px`,
      },
      '.cm-scroller': {
        fontFamily: MONO,
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        color: isDark ? '#cbd5e1' : '#475569',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#334155' : '#e2e8f0',
        color: isDark ? '#f8fafc' : '#0f172a',
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? '#1e293b' : '#f8fafc',
      },
      '.cm-linkedElementLine': {
        backgroundColor: isDark ? '#172554' : '#eff6ff',
        boxShadow: isDark
          ? 'inset 3px 0 0 #60a5fa'
          : 'inset 3px 0 0 #2563eb',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: isDark ? '#f8fafc' : '#0f172a',
      },
      '.cm-content ::selection': {
        backgroundColor: `${selectionColor} !important`,
      },
      '.cm-content *::selection': {
        backgroundColor: `${selectionColor} !important`,
      },
      '.cm-selectionLayer': {
        display: 'none',
      },
      '.cm-lintRange-error': {
        backgroundImage: isDark
          ? 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%23fca5a5" fill="none" stroke-width=".7"/></svg>\')'
          : 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%23dc2626" fill="none" stroke-width=".7"/></svg>\')',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left bottom',
      },
      '.cm-templatePreview': {
        color: isDark ? '#94a3b8' : '#64748b',
        fontStyle: 'italic',
        marginLeft: '0.2em',
        pointerEvents: 'none',
        userSelect: 'none',
      },
      '.cm-tooltip': {
        zIndex: 200,
        border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
        borderRadius: '6px',
        boxShadow: isDark
          ? '0 8px 24px rgba(15, 23, 42, 0.45)'
          : '0 8px 24px rgba(15, 23, 42, 0.12)',
      },
      '.cm-tooltip-autocomplete': {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
      },
      '.cm-tooltip-autocomplete > ul': {
        maxHeight: '12rem',
        overflowY: 'auto',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: isDark ? '#334155' : '#dbeafe',
        color: isDark ? '#f8fafc' : '#0f172a',
      },
      '.cm-tooltip-lint': {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
        maxWidth: '32rem',
      },
      '.cm-diagnostic-error': {
        borderLeft: `3px solid ${isDark ? '#f87171' : '#dc2626'}`,
      },
      '.cm-diagnosticText': {
        color: isDark ? '#f8fafc' : '#0f172a',
      },
    },
    { dark: isDark },
  )
}

export function createYamlEditorTheme(theme: ResolvedTheme, fontSizePx: number) {
  const highlight = theme === 'dark' ? darkHighlight : lightHighlight
  return [editorChrome(theme, fontSizePx), syntaxHighlighting(highlight)]
}
