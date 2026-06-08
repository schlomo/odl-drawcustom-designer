import * as yaml from 'yaml'
import type { DrawElement } from '../schema/elements'
import { normalizePayload } from '../schema/normalizeElements'
import { stripDesignerFieldsFromPayload } from './designer-fields'
import { parseYamlPayload } from './parse'

export function serializeYamlPayload(elements: DrawElement[]): string {
  const normalized = normalizePayload(elements)
  const haClean = stripDesignerFieldsFromPayload(
    normalized as unknown as Record<string, unknown>[],
  ) as DrawElement[]
  return yaml.stringify(haClean, { lineWidth: 0 }).trimEnd() + '\n'
}

export function roundTripYaml(source: string): string {
  return serializeYamlPayload(parseYamlPayload(source))
}
