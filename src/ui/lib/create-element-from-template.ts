import {
  getElementTypeInsertion,
  parseYamlPayload,
  type DrawElement,
} from '../../core'

export function createElementFromTemplate(type: DrawElement['type']): DrawElement {
  const insertion = getElementTypeInsertion(type)
  const yaml = `- type: ${insertion}\n`
  const parsed = parseYamlPayload(yaml)
  const element = parsed[0]
  if (!element) {
    throw new Error(`Failed to create element template for type: ${type}`)
  }
  return element
}
