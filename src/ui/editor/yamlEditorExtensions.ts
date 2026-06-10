import { closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { foldKeymap, indentUnit } from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, tooltips, type ViewUpdate } from '@codemirror/view'
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup'
import type { ResolvedTheme } from '../preferences/theme'
import { jinjaBraceInputHandler, yamlCloseBrackets } from './jinjaBracketHandling'
import { highlightActiveLineWhenCollapsed } from './yamlActiveLine'
import { highlightLinkedElement, linkedElementIndexFacet, yamlLinkedElementCompartment } from './yamlLinkedElement'
import {
  templatePreviewFacet,
  yamlTemplatePreviewCompartment,
  showTemplatePreview,
  type TemplatePreviewConfig,
} from './yamlTemplatePreview'
import { yamlEditorAutocompletion } from './yamlCompletionSource'
import { YAML_EDITOR_BASIC_SETUP } from './yamlEditorSetup'
import { yamlEntityIdsCompartment, yamlEntityIdsFacet } from './yamlEntityIds'
import { yamlWithJinja } from './yamlLanguage'
import { yamlPayloadLinter } from './yamlLint'
import { createYamlEditorTheme } from './yamlTheme'
import { shouldReportLinkedYamlCursor, shouldReportYamlDocChange } from './yamlEditorSelection'
import type { StoredEditorSelection } from './yamlEditorScroll'

export const yamlThemeCompartment = new Compartment()

export function yamlEditorKeymap() {
  return keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ])
}

export function yamlEditorTooltipExtension() {
  return tooltips({
    parent: document.body,
    position: 'fixed',
  })
}

export function createYamlEditorState(
  doc: string,
  colorScheme: ResolvedTheme,
  fontSizePx: number,
  entityIds: readonly string[],
  onDocChange: (value: string, update: ViewUpdate) => void,
  pointerActiveRef: { current: boolean },
  onCursorPositionChangeRef: {
    current: ((position: number, doc: string) => void) | undefined
  },
  suppressCursorReportRef: { current: boolean },
  yamlSelectionRef?: { current: StoredEditorSelection },
  templatePreview: TemplatePreviewConfig = { enabled: true, context: { states: {} } },
  onEditorBlurRef?: { current: (() => void) | undefined },
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      indentUnit.of('  '),
      EditorState.tabSize.of(2),
      jinjaBraceInputHandler(),
      ...basicSetup(YAML_EDITOR_BASIC_SETUP),
      yamlCloseBrackets(),
      yamlEditorKeymap(),
      yamlWithJinja(),
      yamlEditorAutocompletion(),
      yamlPayloadLinter(),
      yamlEditorTooltipExtension(),
      EditorView.domEventHandlers({
        mousedown: () => {
          pointerActiveRef.current = true
        },
        mouseup: () => {
          pointerActiveRef.current = false
        },
        blur: () => {
          pointerActiveRef.current = false
          onEditorBlurRef?.current?.()
        },
      }),
      highlightActiveLineWhenCollapsed(),
      yamlLinkedElementCompartment.of([
        linkedElementIndexFacet.of(null),
        highlightLinkedElement(),
      ]),
      yamlTemplatePreviewCompartment.of([
        templatePreviewFacet.of(templatePreview),
        showTemplatePreview(),
      ]),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet && yamlSelectionRef) {
          const { anchor, head } = update.state.selection.main
          yamlSelectionRef.current = { anchor, head }
        }

        if (
          shouldReportYamlDocChange(update.docChanged, update.transactions)
        ) {
          onDocChange(update.state.doc.toString(), update)
        }

        const onCursorPositionChange = onCursorPositionChangeRef.current
        if (!onCursorPositionChange || suppressCursorReportRef.current) {
          return
        }

        const userInitiated = update.transactions.some(
          (transaction) => transaction.annotation(Transaction.userEvent) != null,
        )
        const { main } = update.state.selection

        if (
          !shouldReportLinkedYamlCursor({
            selectionSet: update.selectionSet,
            docChanged: update.docChanged,
            viewHasFocus: update.view.hasFocus,
            pointerActive: pointerActiveRef.current,
            selectionEmpty: main.empty,
            userInitiated,
          })
        ) {
          return
        }

        onCursorPositionChange(main.head, update.state.doc.toString())
      }),
      yamlThemeCompartment.of(createYamlEditorTheme(colorScheme, fontSizePx)),
      yamlEntityIdsCompartment.of(yamlEntityIdsFacet.of(entityIds)),
    ],
  })
}
