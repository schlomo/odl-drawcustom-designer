export {
  scanPayloadForTemplates,
  hasTemplateSyntax,
  extractEntityIds,
  extractTemplateExpressions,
  extractAttributeReferences,
  type AttributeReference,
} from './scan'
export { evaluateTemplate, TemplateEvaluationError } from './evaluate'
export { applyTemplateContextToPayload } from './preview'
export {
  resolvePreviewClockInterval,
  templateNeedsSecondPrecision,
  templateUsesNow,
  type PreviewClockInterval,
} from './preview-clock'
export type { HaMockContext, TemplateReference, TemplateScanResult } from './types'
