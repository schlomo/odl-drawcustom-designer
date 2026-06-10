import {
  evaluateTemplate,
  hasTemplateSyntax,
  TemplateEvaluationError,
  type HaMockContext,
} from '../../core'

export interface TemplatePreviewAnchor {
  /** Document position for the widget (after the closing quote). */
  pos: number
  /** Inline label after the arrow. */
  preview: string
  /** Full text for hover when the inline label is truncated. */
  tooltip?: string
}

const DOUBLE_QUOTED = /"(?:[^"\\]|\\.)*"/g
const SINGLE_QUOTED = /'(?:[^'\\]|\\.)*'/g

export const TEMPLATE_PREVIEW_MAX_LENGTH = 48
export const TEMPLATE_ERROR_INLINE_MAX_LENGTH = 72

export function formatTemplatePreviewLabel(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TEMPLATE_PREVIEW_MAX_LENGTH) {
    return collapsed
  }
  return `${collapsed.slice(0, TEMPLATE_PREVIEW_MAX_LENGTH - 1)}…`
}

export function formatTemplateErrorPreview(message: string): string {
  const inline = `[error] ${message}`
  if (inline.length <= TEMPLATE_ERROR_INLINE_MAX_LENGTH) {
    return inline
  }
  return `${inline.slice(0, TEMPLATE_ERROR_INLINE_MAX_LENGTH - 1)}…`
}

export function simplifyTemplateErrorMessage(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '(unknown path)')

  const explicit = lines.find((line) => line.startsWith('Error:'))
  if (explicit) {
    return explicit.replace(/^Error:\s*/, '')
  }

  return lines[lines.length - 1] ?? message
}

export function extractTemplatePreviewErrorMessage(error: unknown): string {
  let message = 'Template evaluation failed'

  if (error instanceof TemplateEvaluationError) {
    message = simplifyTemplateErrorMessage(error.message)
    if (message === 'Template evaluation failed' && error.cause instanceof Error) {
      message = simplifyTemplateErrorMessage(error.cause.message)
    }
  } else if (error instanceof Error) {
    message = simplifyTemplateErrorMessage(error.message)
  }

  return message
}

export function formatTemplatePreviewError(error: unknown): string {
  return formatTemplateErrorPreview(extractTemplatePreviewErrorMessage(error))
}

interface TemplatePreviewResult {
  preview: string
  tooltip?: string
}

function evaluateTemplatePreview(template: string, context: HaMockContext): TemplatePreviewResult {
  try {
    return { preview: formatTemplatePreviewLabel(evaluateTemplate(template, context)) }
  } catch (error) {
    const message = extractTemplatePreviewErrorMessage(error)
    return {
      preview: formatTemplateErrorPreview(message),
      tooltip: message,
    }
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

    const result = evaluateTemplatePreview(inner, context)

    out.push({
      pos: start + quoted.length,
      preview: result.preview,
      tooltip: result.tooltip,
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
