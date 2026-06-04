import * as yaml from 'yaml'

/** Phase 0 stub — full YAML engine arrives in Phase 1. */
export type DrawElement = Record<string, unknown>

export function parseYamlPayload(source: string): DrawElement[] {
  const parsed = yaml.parse(source)
  if (!Array.isArray(parsed)) {
    throw new Error('YAML payload must be a list of drawing elements')
  }
  return parsed as DrawElement[]
}

export function serializeYamlPayload(elements: DrawElement[]): string {
  return yaml.stringify(elements, { lineWidth: 0 }).trimEnd() + '\n'
}

export function roundTripYaml(source: string): string {
  return serializeYamlPayload(parseYamlPayload(source))
}
