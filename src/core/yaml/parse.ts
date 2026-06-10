import * as yaml from 'yaml'
import type { DrawElement } from '../schema/elements'
import { quoteUnquotedBraceScalars, repairFlowMapMisparse } from './flow-map-repair'

function parseYamlValue(source: string): unknown {
  const prepared = quoteUnquotedBraceScalars(source)
  const parsed = yaml.parse(prepared)
  return repairFlowMapMisparse(parsed)
}

export function parseYamlPayload(source: string): DrawElement[] {
  const parsed = parseYamlValue(source)
  if (!Array.isArray(parsed)) {
    throw new Error('YAML payload must be a list of drawing elements')
  }
  return parsed as DrawElement[]
}

export function parseYamlDocument(source: string): unknown {
  return parseYamlValue(source)
}
