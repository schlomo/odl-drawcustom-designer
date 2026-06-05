import type { Payload } from '../schema/payload'
import {
  extractEntityIds,
  extractTemplateExpressions,
  hasTemplateSyntax,
  walkStringValues,
} from './patterns'
import type { TemplateReference, TemplateScanResult } from './types'

export function scanPayloadForTemplates(payload: Payload): TemplateScanResult {
  const references: TemplateReference[] = []
  const entityIdSet = new Set<string>()

  payload.forEach((element, index) => {
    walkStringValues(element, `[${index}]`, (raw, path) => {
      if (!hasTemplateSyntax(raw)) {
        return
      }

      references.push({
        path,
        raw,
        expressions: extractTemplateExpressions(raw),
      })

      for (const entityId of extractEntityIds(raw)) {
        entityIdSet.add(entityId)
      }
    })
  })

  return {
    references,
    entityIds: [...entityIdSet].sort(),
  }
}

export { extractEntityIds, extractTemplateExpressions, hasTemplateSyntax } from './patterns'
