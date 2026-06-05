import * as yaml from 'yaml'
import type { DrawElement } from '../schema/elements'
import { stripDesignerFieldsFromPayload } from './designer-fields'
import { parseYamlPayload } from './parse'

export function serializeYamlPayload(elements: DrawElement[]): string {
  const haClean = stripDesignerFieldsFromPayload(
    elements as unknown as Record<string, unknown>[],
  ) as DrawElement[]
  return yaml.stringify(haClean, { lineWidth: 0 }).trimEnd() + '\n'
}

export function roundTripYaml(source: string): string {
  return serializeYamlPayload(parseYamlPayload(source))
}
