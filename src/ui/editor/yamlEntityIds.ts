import { Facet } from '@codemirror/state'
import { Compartment } from '@codemirror/state'

/** An entity offered by autocomplete: its id plus the friendly name the host
 * state catalog supplied, when there is one (issue #170 — matching runs over
 * both). */
export interface EntityCompletionEntry {
  id: string
  name?: string
}

export const yamlEntityIdsFacet = Facet.define<
  readonly EntityCompletionEntry[],
  readonly EntityCompletionEntry[]
>({
  combine: (values) => values[values.length - 1] ?? [],
})

export const yamlEntityIdsCompartment = new Compartment()

export function yamlEntityIdsExtension(entities: readonly EntityCompletionEntry[]) {
  return yamlEntityIdsCompartment.of(yamlEntityIdsFacet.of(entities))
}
