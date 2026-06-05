import { closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, historyKeymap } from '@codemirror/commands'
import { foldKeymap } from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, tooltips, type ViewUpdate } from '@codemirror/view'
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup'
import type { ResolvedTheme } from '../preferences/theme'
import { jinjaBraceInputHandler, yamlCloseBrackets } from './jinjaBracketHandling'
import { highlightActiveLineWhenCollapsed } from './yamlActiveLine'
import { yamlEditorAutocompletion } from './yamlCompletionSource'
import { YAML_EDITOR_BASIC_SETUP } from './yamlEditorSetup'
import { yamlEntityIdsCompartment, yamlEntityIdsFacet } from './yamlEntityIds'
import { yamlWithJinja } from './yamlLanguage'
import { yamlPayloadLinter } from './yamlLint'
import { createYamlEditorTheme } from './yamlTheme'

export const yamlThemeCompartment = new Compartment()

export function yamlEditorKeymap() {
  return keymap.of([
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
    current: ((position: number) => void) | undefined
  },
  shouldReportCursor: (selection: { empty: boolean }) => boolean,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
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
        },
      }),
      highlightActiveLineWhenCollapsed(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onDocChange(update.state.doc.toString(), update)
        }

        const onCursorPositionChange = onCursorPositionChangeRef.current
        if (!onCursorPositionChange) {
          return
        }
        if (!update.selectionSet && !update.docChanged) {
          return
        }

        const { main } = update.state.selection
        if (!shouldReportCursor(main)) {
          return
        }

        onCursorPositionChange(main.head)
      }),
      yamlThemeCompartment.of(createYamlEditorTheme(colorScheme, fontSizePx)),
      yamlEntityIdsCompartment.of(yamlEntityIdsFacet.of(entityIds)),
    ],
  })
}
