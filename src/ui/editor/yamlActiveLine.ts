import { Decoration, ViewPlugin, type ViewUpdate } from '@codemirror/view'

const activeLineMark = Decoration.line({ class: 'cm-activeLine' })

export function shouldShowActiveLineHighlight(selection: { empty: boolean }): boolean {
  return selection.empty
}

function activeLineDecorations(update: ViewUpdate) {
  if (!shouldShowActiveLineHighlight(update.state.selection.main)) {
    return Decoration.none
  }

  const line = update.state.doc.lineAt(update.state.selection.main.head)
  return Decoration.set([activeLineMark.range(line.from)])
}

/** Highlight the caret line only when the selection is collapsed. */
export function highlightActiveLineWhenCollapsed() {
  return ViewPlugin.fromClass(
    class {
      decorations = Decoration.none

      update(update: ViewUpdate) {
        if (!update.selectionSet && !update.docChanged && !update.viewportChanged) {
          return
        }
        this.decorations = activeLineDecorations(update)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}
