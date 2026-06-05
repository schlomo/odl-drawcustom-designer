import * as yaml from 'yaml'
import type { DrawElement } from '../schema/elements'

export function parseYamlPayload(source: string): DrawElement[] {
  const parsed = yaml.parse(source)
  if (!Array.isArray(parsed)) {
    throw new Error('YAML payload must be a list of drawing elements')
  }
  return parsed as DrawElement[]
}

export function parseYamlDocument(source: string): unknown {
  return yaml.parse(source)
}
