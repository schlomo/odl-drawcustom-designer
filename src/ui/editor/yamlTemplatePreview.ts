import { Compartment, Facet, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { HaMockContext } from '../../core'
import { findTemplatePreviewAnchors } from './templatePreviewAnchors'

export interface TemplatePreviewConfig {
  enabled: boolean
  context: HaMockContext
}

/** Update preview `now()` without reconfiguring the whole editor compartment. */
export const templatePreviewNowEffect = StateEffect.define<Date>()

export const templatePreviewFacet = Facet.define<TemplatePreviewConfig, TemplatePreviewConfig>({
  combine: (values) => values[values.length - 1] ?? { enabled: false, context: { states: {} } },
})

export const yamlTemplatePreviewCompartment = new Compartment()

class TemplatePreviewWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly tooltip?: string,
  ) {
    super()
  }

  eq(other: TemplatePreviewWidget): boolean {
    return other.label === this.label && other.tooltip === this.tooltip
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-templatePreview'
    span.textContent = ` → ${this.label}`
    span.title = this.tooltip ?? `Template preview (State Simulator): ${this.label}`
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

function previewContext(config: TemplatePreviewConfig, now: Date): HaMockContext {
  return { ...config.context, now }
}

export function buildTemplatePreviewDecorations(
  doc: string,
  config: TemplatePreviewConfig,
  now: Date = config.context.now ?? new Date(),
): DecorationSet {
  if (!config.enabled) {
    return Decoration.none
  }

  const builder = new RangeSetBuilder<Decoration>()
  const context = previewContext(config, now)
  for (const anchor of findTemplatePreviewAnchors(doc, context)) {
    builder.add(
      anchor.pos,
      anchor.pos,
      Decoration.widget({
        side: 1,
        widget: new TemplatePreviewWidget(anchor.preview, anchor.tooltip),
      }),
    )
  }

  return builder.finish()
}

export function showTemplatePreview() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      private now: Date = new Date()

      constructor(view: EditorView) {
        const config = view.state.facet(templatePreviewFacet)
        this.now = config.context.now ?? new Date()
        this.decorations = buildTemplatePreviewDecorations(
          view.state.doc.toString(),
          config,
          this.now,
        )
      }

      update(update: ViewUpdate) {
        const config = update.state.facet(templatePreviewFacet)
        const previous = update.startState.facet(templatePreviewFacet)
        let now = this.now

        for (const transaction of update.transactions) {
          for (const effect of transaction.effects) {
            if (effect.is(templatePreviewNowEffect)) {
              now = effect.value
            }
          }
        }

        const configChanged =
          config.enabled !== previous.enabled ||
          config.context.states !== previous.context.states ||
          config.context.attributes !== previous.context.attributes ||
          config.context.variables !== previous.context.variables

        const nowChanged = now.getTime() !== this.now.getTime()

        if (!update.docChanged && !configChanged && !nowChanged) {
          return
        }

        this.now = now
        this.decorations = buildTemplatePreviewDecorations(
          update.state.doc.toString(),
          config,
          this.now,
        )
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
