import { Document } from 'yaml'
import type { DrawElement } from '../schema/elements'
import { normalizePayload } from '../schema/normalizeElements'
import { applyBlockScalarTypes, prettifyFoldedBlockScalars } from './blockScalars'
import { stripDesignerFieldsFromPayload } from './designer-fields'
import { parseYamlPayload } from './parse'

export function serializeYamlPayload(elements: DrawElement[]): string {
  const normalized = normalizePayload(elements)
  const haClean = stripDesignerFieldsFromPayload(
    normalized as unknown as Record<string, unknown>[],
  ) as DrawElement[]
  const doc = new Document(haClean)
  applyBlockScalarTypes(doc)
  // Folded blocks must start as a single line so delimiter reflow can replace the body.
  const serialized = doc.toString({ lineWidth: 0 }).trimEnd() + '\n'
  return prettifyFoldedBlockScalars(serialized, haClean)
}

export function roundTripYaml(source: string): string {
  return serializeYamlPayload(parseYamlPayload(source))
}
