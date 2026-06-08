import {
  evaluateTemplate,
  hasTemplateSyntax,
  TemplateEvaluationError,
  type HaMockContext,
} from '../../core'

export interface TemplatePreviewAnchor {
  /** Document position for the widget (after the closing quote). */
  pos: number
  preview: string
}

const DOUBLE_QUOTED = /"(?:[^"\\]|\\.)*"/g
const SINGLE_QUOTED = /'(?:[^'\\]|\\.)*'/g

export const TEMPLATE_PREVIEW_MAX_LENGTH = 48

export function formatTemplatePreviewLabel(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TEMPLATE_PREVIEW_MAX_LENGTH) {
    return collapsed
  }
  return `${collapsed.slice(0, TEMPLATE_PREVIEW_MAX_LENGTH - 1)}…`
}

function evaluateTemplatePreview(template: string, context: HaMockContext): string {
  try {
    return formatTemplatePreviewLabel(evaluateTemplate(template, context))
  } catch (error) {
    if (error instanceof TemplateEvaluationError) {
      return '[template error]'
    }
    return '[template error]'
  }
}

function collectQuotedTemplateAnchors(
  doc: string,
  pattern: RegExp,
  context: HaMockContext,
  out: TemplatePreviewAnchor[],
): void {
  pattern.lastIndex = 0
  for (const match of doc.matchAll(pattern)) {
    const quoted = match[0]
    const start = match.index
    if (start === undefined) {
      continue
    }

    const inner = quoted.slice(1, -1)
    if (!hasTemplateSyntax(inner) || inner.includes('\n')) {
      continue
    }

    out.push({
      pos: start + quoted.length,
      preview: evaluateTemplatePreview(inner, context),
    })
  }
}

/** Find inline preview anchors for YAML quoted strings containing Jinja templates. */
export function findTemplatePreviewAnchors(
  doc: string,
  context: HaMockContext,
): TemplatePreviewAnchor[] {
  const anchors: TemplatePreviewAnchor[] = []
  collectQuotedTemplateAnchors(doc, DOUBLE_QUOTED, context, anchors)
  collectQuotedTemplateAnchors(doc, SINGLE_QUOTED, context, anchors)
  anchors.sort((a, b) => a.pos - b.pos)
  return anchors
}
