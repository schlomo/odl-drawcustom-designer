import { Facet } from '@codemirror/state'
import { Compartment } from '@codemirror/state'

export const yamlEntityIdsFacet = Facet.define<readonly string[], readonly string[]>({
  combine: (values) => values[values.length - 1] ?? [],
})

export const yamlEntityIdsCompartment = new Compartment()

export function yamlEntityIdsExtension(entityIds: readonly string[]) {
  return yamlEntityIdsCompartment.of(yamlEntityIdsFacet.of(entityIds))
}
