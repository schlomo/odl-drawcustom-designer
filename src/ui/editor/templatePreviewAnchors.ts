import {
  evaluateTemplate,
  findYamlQuotedScalarRegions,
  hasTemplateSyntax,
  TemplateEvaluationError,
  type HaMockContext,
} from '../../core'
import { findYamlBlockScalarRegions } from './yamlBlockScalarContext'

export interface TemplatePreviewAnchor {
  /** Document position for the widget (after the closing quote). */
  pos: number
  /** Inline label after the arrow. */
  preview: string
  /** Full text for hover when the inline label is truncated. */
  tooltip?: string
}

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

/**
 * Quoted-scalar template anchors, sourced from the PARSED YAML value (via
 * `findYamlQuotedScalarRegions`) rather than raw editor text — this is what
 * makes HA-style `''`-escaped single-quoted scalars evaluate correctly
 * (issue #168). See that function's doc comment for the full rationale.
 */
function collectQuotedTemplateAnchors(
  doc: string,
  context: HaMockContext,
  out: TemplatePreviewAnchor[],
): void {
  for (const region of findYamlQuotedScalarRegions(doc)) {
    if (!hasTemplateSyntax(region.value)) {
      continue
    }

    const result = evaluateTemplatePreview(region.value, context)

    out.push({
      pos: region.valueEnd,
      preview: result.preview,
      tooltip: result.tooltip,
    })
  }
}

function collectBlockScalarTemplateAnchors(
  doc: string,
  context: HaMockContext,
  out: TemplatePreviewAnchor[],
): void {
  for (const region of findYamlBlockScalarRegions(doc)) {
    if (!hasTemplateSyntax(region.value)) {
      continue
    }

    const result = evaluateTemplatePreview(region.value, context)
    out.push({
      pos: region.valueEnd,
      preview: result.preview,
      tooltip: result.tooltip,
    })
  }
}

/**
 * Find inline preview anchors for YAML quoted strings containing Jinja
 * templates. Each field is evaluated INDEPENDENTLY so the inline preview matches
 * the canvas render path: a `{% set %}` / `namespace()` defined in one element's
 * field is NOT visible to another field (ADR-004 per-field model). Cross-field
 * values are shared via user-defined Simulator variables (`context.variables`).
 */
export function findTemplatePreviewAnchors(
  doc: string,
  context: HaMockContext,
): TemplatePreviewAnchor[] {
  const anchors: TemplatePreviewAnchor[] = []
  collectQuotedTemplateAnchors(doc, context, anchors)
  collectBlockScalarTemplateAnchors(doc, context, anchors)
  anchors.sort((a, b) => a.pos - b.pos)
  return anchors
}
