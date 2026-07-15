import { Compartment, Facet, RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { findElementSpans } from '../../core'

export const linkedElementIndexFacet = Facet.define<number | null, number | null>({
  combine: (values) => values[values.length - 1] ?? null,
})

export const yamlLinkedElementCompartment = new Compartment()

const linkedElementLine = Decoration.line({ class: 'cm-linkedElementLine' })

function buildLinkedElementDecorations(doc: string, elementIndex: number | null): DecorationSet {
  if (elementIndex == null || elementIndex < 0) {
    return Decoration.none
  }

  const span = findElementSpans(doc)[elementIndex]
  if (!span) {
    return Decoration.none
  }

  const builder = new RangeSetBuilder<Decoration>()
  const lines = doc.split('\n')
  let offset = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const lineStart = offset
    const lineEnd = offset + line.length

    if (lineStart >= span.start && lineStart < span.end) {
      builder.add(lineStart, lineStart, linkedElementLine)
    }

    offset = lineEnd + 1
  }

  return builder.finish()
}

/** Highlight the YAML block for the canvas-linked element (works without editor focus). */
export function highlightLinkedElement() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none

      update(update: ViewUpdate) {
        const index = update.state.facet(linkedElementIndexFacet)
        const previousIndex = update.startState.facet(linkedElementIndexFacet)
        if (!update.docChanged && index === previousIndex) {
          return
        }

        this.decorations = buildLinkedElementDecorations(update.state.doc.toString(), index)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

export function linkedElementDecorationsForTest(doc: string, elementIndex: number | null): DecorationSet {
  return buildLinkedElementDecorations(doc, elementIndex)
}

export function reconfigureLinkedElementIndex(index: number | null) {
  return yamlLinkedElementCompartment.reconfigure([
    linkedElementIndexFacet.of(index),
    highlightLinkedElement(),
  ])
}
