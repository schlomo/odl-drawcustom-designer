export {
  scanPayloadForTemplates,
  hasTemplateSyntax,
  extractEntityIds,
  extractTemplateExpressions,
  extractAttributeReferences,
  extractVariableReferences,
  type AttributeReference,
} from './scan'
export { evaluateTemplate, TemplateEvaluationError } from './evaluate'
export { coerceAttributeValue, attributeValueEquals } from './attribute-values'
export {
  applyTemplateContextToElement,
  applyTemplateContextToPayload,
  elementHasTemplates,
} from './preview'
export {
  resolvePreviewClockInterval,
  templateNeedsSecondPrecision,
  templateUsesNow,
  type PreviewClockInterval,
} from './preview-clock'
export type { HaMockContext, TemplateReference, TemplateScanResult } from './types'
