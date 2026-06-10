import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { ResolvedTheme } from '../preferences/theme'

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

/**
 * Classical editor palette (VS Code Default Dark+/Light+ style).
 * Keys blue, strings orange/red, numbers green, booleans blue, comments green.
 */
const palette = {
  dark: {
    keyword: '#569cd6',
    key: '#9cdcfe',
    string: '#ce9178',
    number: '#b5cea8',
    bool: '#569cd6',
    null: '#569cd6',
    comment: '#6a9955',
    punctuation: '#d4d4d4',
    brace: '#ffd700',
    meta: '#808080',
    jinja: '#4ec9b0',
    text: '#d4d4d4',
    bg: '#1e1e1e',
    gutterBg: '#1e1e1e',
    gutterText: '#858585',
    activeLine: '#2a2a2a',
    activeLineGutter: '#2a2a2a',
    selection: '#264f78',
    linkedLine: '#264f78',
    linkedAccent: '#569cd6',
    templatePreview: '#808080',
    border: '#454545',
    autocompleteSelected: '#094771',
    lintError: '#f48771',
  },
  light: {
    keyword: '#0000ff',
    key: '#0451a5',
    string: '#a31515',
    number: '#098658',
    bool: '#0000ff',
    null: '#0000ff',
    comment: '#008000',
    punctuation: '#000000',
    brace: '#000000',
    meta: '#811f3f',
    jinja: '#001080',
    text: '#000000',
    bg: '#ffffff',
    gutterBg: '#f3f3f3',
    gutterText: '#237893',
    activeLine: '#f5f5f5',
    activeLineGutter: '#f5f5f5',
    selection: '#add6ff',
    linkedLine: '#e8f2ff',
    linkedAccent: '#0451a5',
    templatePreview: '#6a737d',
    border: '#c8c8c8',
    autocompleteSelected: '#d6ebff',
    lintError: '#e51400',
  },
} as const

type YamlSyntaxPalette = (typeof palette)['dark'] | (typeof palette)['light']

function defineHighlight(colors: YamlSyntaxPalette) {
  return HighlightStyle.define([
    { tag: tags.keyword, color: colors.keyword },
    { tag: tags.controlKeyword, color: colors.keyword },
    { tag: tags.operatorKeyword, color: colors.punctuation },
    { tag: tags.definitionKeyword, color: colors.key },
    { tag: tags.modifier, color: colors.key },
    { tag: tags.string, color: colors.string },
    { tag: tags.special(tags.string), color: colors.string },
    { tag: tags.number, color: colors.number },
    { tag: tags.integer, color: colors.number },
    { tag: tags.float, color: colors.number },
    { tag: tags.bool, color: colors.bool },
    { tag: tags.null, color: colors.null },
    { tag: tags.content, color: colors.text },
    { tag: tags.literal, color: colors.text },
    { tag: tags.comment, color: colors.comment, fontStyle: 'italic' },
    { tag: tags.lineComment, color: colors.comment, fontStyle: 'italic' },
    { tag: tags.propertyName, color: colors.key },
    { tag: tags.definition(tags.propertyName), color: colors.key },
    { tag: tags.variableName, color: colors.jinja },
    { tag: tags.definition(tags.variableName), color: colors.jinja },
    { tag: tags.special(tags.variableName), color: colors.jinja },
    { tag: tags.function(tags.variableName), color: colors.jinja },
    { tag: tags.standard(tags.variableName), color: colors.jinja },
    { tag: tags.self, color: colors.jinja },
    { tag: tags.logicOperator, color: colors.punctuation },
    { tag: tags.compareOperator, color: colors.punctuation },
    { tag: tags.operator, color: colors.punctuation },
    { tag: tags.punctuation, color: colors.punctuation },
    { tag: tags.separator, color: colors.punctuation },
    { tag: tags.brace, color: colors.brace },
    { tag: tags.squareBracket, color: colors.brace },
    { tag: tags.paren, color: colors.punctuation },
    { tag: tags.meta, color: colors.meta },
    { tag: tags.labelName, color: colors.meta },
    { tag: tags.typeName, color: colors.meta },
    { tag: tags.attributeValue, color: colors.string },
  ])
}

const darkHighlight = defineHighlight(palette.dark)
const lightHighlight = defineHighlight(palette.light)

function editorChrome(theme: ResolvedTheme, fontSizePx: number) {
  const colors = palette[theme]

  return EditorView.theme(
    {
      '&': {
        backgroundColor: colors.bg,
        color: colors.text,
      },
      '.cm-content': {
        caretColor: colors.text,
        fontFamily: MONO,
        fontSize: `${fontSizePx}px`,
        lineHeight: `${Math.round(fontSizePx * 1.55 * 100) / 100}px`,
      },
      '.cm-scroller': {
        fontFamily: MONO,
      },
      '.cm-gutters': {
        backgroundColor: colors.gutterBg,
        color: colors.gutterText,
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: colors.activeLineGutter,
        color: colors.text,
      },
      '.cm-activeLine': {
        backgroundColor: colors.activeLine,
      },
      '.cm-linkedElementLine': {
        backgroundColor: colors.linkedLine,
        boxShadow: `inset 3px 0 0 ${colors.linkedAccent}`,
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: colors.text,
      },
      '.cm-content ::selection': {
        backgroundColor: `${colors.selection} !important`,
      },
      '.cm-content *::selection': {
        backgroundColor: `${colors.selection} !important`,
      },
      '.cm-selectionLayer': {
        display: 'none',
      },
      // Syntax-tree spans set their own color; override for line-based YAML roles.
      '.cm-yamlKey, .cm-yamlKey *': {
        color: `${colors.key} !important`,
      },
      '.cm-yamlBlockIndicator, .cm-yamlBlockIndicator *': {
        color: `${colors.string} !important`,
      },
      '.cm-yamlScalarNumber, .cm-yamlScalarNumber *': {
        color: `${colors.number} !important`,
      },
      '.cm-yamlScalarBool, .cm-yamlScalarBool *': {
        color: `${colors.bool} !important`,
      },
      '.cm-yamlScalarNull, .cm-yamlScalarNull *': {
        color: `${colors.null} !important`,
      },
      '.cm-lintRange-error': {
        backgroundImage:
          theme === 'dark'
            ? 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%23f48771" fill="none" stroke-width=".7"/></svg>\')'
            : 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l1 0 l2 2 l1 0" stroke="%23e51400" fill="none" stroke-width=".7"/></svg>\')',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left bottom',
      },
      '.cm-templatePreview': {
        color: colors.templatePreview,
        fontStyle: 'italic',
        marginLeft: '0.2em',
        pointerEvents: 'none',
        userSelect: 'none',
      },
      '.cm-tooltip': {
        zIndex: 200,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        boxShadow:
          theme === 'dark'
            ? '0 8px 24px rgba(15, 23, 42, 0.45)'
            : '0 8px 24px rgba(15, 23, 42, 0.12)',
      },
      '.cm-tooltip-autocomplete': {
        backgroundColor: colors.gutterBg,
        color: colors.text,
      },
      '.cm-tooltip-autocomplete > ul': {
        maxHeight: '12rem',
        overflowY: 'auto',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: colors.autocompleteSelected,
        color: colors.text,
      },
      '.cm-tooltip-lint': {
        backgroundColor: colors.gutterBg,
        color: colors.text,
        maxWidth: '32rem',
      },
      '.cm-diagnostic-error': {
        borderLeft: `3px solid ${colors.lintError}`,
      },
      '.cm-diagnosticText': {
        color: colors.text,
      },
    },
    { dark: theme === 'dark' },
  )
}

export function createYamlEditorTheme(theme: ResolvedTheme, fontSizePx: number) {
  const highlight = theme === 'dark' ? darkHighlight : lightHighlight
  return [editorChrome(theme, fontSizePx), syntaxHighlighting(highlight)]
}
