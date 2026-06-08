import { Compartment, Facet, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { HaMockContext } from '../../core'
import { findTemplatePreviewAnchors } from './templatePreviewAnchors'

export interface TemplatePreviewConfig {
  enabled: boolean
  context: HaMockContext
}

export const templatePreviewFacet = Facet.define<TemplatePreviewConfig, TemplatePreviewConfig>({
  combine: (values) => values[values.length - 1] ?? { enabled: false, context: { states: {} } },
})

export const yamlTemplatePreviewCompartment = new Compartment()

class TemplatePreviewWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }

  eq(other: TemplatePreviewWidget): boolean {
    return other.label === this.label
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-templatePreview'
    span.textContent = ` → ${this.label}`
    span.title = `Template preview (State Simulator): ${this.label}`
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

export function buildTemplatePreviewDecorations(
  doc: string,
  config: TemplatePreviewConfig,
): DecorationSet {
  if (!config.enabled) {
    return Decoration.none
  }

  const builder = new RangeSetBuilder<Decoration>()
  for (const anchor of findTemplatePreviewAnchors(doc, config.context)) {
    builder.add(
      anchor.pos,
      anchor.pos,
      Decoration.widget({
        side: 1,
        widget: new TemplatePreviewWidget(anchor.preview),
      }),
    )
  }

  return builder.finish()
}

export function showTemplatePreview() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none

      constructor(view: EditorView) {
        this.decorations = buildTemplatePreviewDecorations(
          view.state.doc.toString(),
          view.state.facet(templatePreviewFacet),
        )
      }

      update(update: ViewUpdate) {
        const config = update.state.facet(templatePreviewFacet)
        const previous = update.startState.facet(templatePreviewFacet)
        const configChanged =
          config.enabled !== previous.enabled ||
          config.context !== previous.context ||
          config.context.states !== previous.context.states

        if (!update.docChanged && !configChanged) {
          return
        }

        this.decorations = buildTemplatePreviewDecorations(update.state.doc.toString(), config)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

export function yamlTemplatePreviewExtension(config: TemplatePreviewConfig) {
  return yamlTemplatePreviewCompartment.of([templatePreviewFacet.of(config), showTemplatePreview()])
}

export function reconfigureTemplatePreview(config: TemplatePreviewConfig) {
  return yamlTemplatePreviewCompartment.reconfigure([
    templatePreviewFacet.of(config),
    showTemplatePreview(),
  ])
}
