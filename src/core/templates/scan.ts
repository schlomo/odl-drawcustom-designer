import type { Payload } from '../schema/payload'
import {
  extractAttributeReferences,
  extractEntityIds,
  extractTemplateExpressions,
  extractVariableReferences,
  hasTemplateSyntax,
  walkStringValues,
} from './patterns'
import type { TemplateReference, TemplateScanResult } from './types'

export function scanPayloadForTemplates(payload: Payload): TemplateScanResult {
  const references: TemplateReference[] = []
  const entityIdSet = new Set<string>()
  const attributeSetByEntity = new Map<string, Set<string>>()
  const variableSet = new Set<string>()

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

      for (const { entityId, attribute } of extractAttributeReferences(raw)) {
        let attributes = attributeSetByEntity.get(entityId)
        if (!attributes) {
          attributes = new Set<string>()
          attributeSetByEntity.set(entityId, attributes)
        }
        attributes.add(attribute)
      }

      for (const variable of extractVariableReferences(raw)) {
        variableSet.add(variable)
      }
    })
  })

  const attributesByEntity: Record<string, string[]> = {}
  for (const [entityId, attributes] of attributeSetByEntity) {
    attributesByEntity[entityId] = [...attributes].sort()
  }

  return {
    references,
    entityIds: [...entityIdSet].sort(),
    attributesByEntity,
    variablesReferenced: [...variableSet].sort(),
  }
}

export {
  extractAttributeReferences,
  extractEntityIds,
  extractTemplateExpressions,
  extractVariableReferences,
  hasTemplateSyntax,
} from './patterns'
export type { AttributeReference } from './patterns'
