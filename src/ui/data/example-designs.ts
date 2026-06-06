import { DRAW_ELEMENT_TYPES, type DrawElement } from '../../core'
import { createElementFromTemplate } from '../lib/create-element-from-template'
import { SAMPLE_ELEMENTS } from './sample-elements'

export interface ExampleDesign {
  id: string
  label: string
  elements: DrawElement[]
}

function formatTypeLabel(type: DrawElement['type']): string {
  return type.replace(/_/g, ' ')
}

export const EXAMPLE_DESIGNS: ExampleDesign[] = [
  {
    id: 'sample-dashboard',
    label: 'Sample dashboard',
    elements: SAMPLE_ELEMENTS,
  },
  ...DRAW_ELEMENT_TYPES.map((type) => ({
    id: `minimal-${type}`,
    label: formatTypeLabel(type),
    elements: [createElementFromTemplate(type)],
  })),
]
