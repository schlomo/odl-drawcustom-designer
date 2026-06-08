import { describe, expect, it } from 'vitest'
import { serializeYamlPayload } from '../../../src/core'
import { SAMPLE_ELEMENTS } from '../../../src/ui/data/sample-elements'
import {
  elementsSequenceEqual,
  remapSelectedIndex,
  tryParseYamlElements,
} from '../../../src/ui/editor/yamlElementsSync'

function indexOfType(type: (typeof SAMPLE_ELEMENTS)[number]['type']): number {
  return SAMPLE_ELEMENTS.findIndex((element) => element.type === type)
}

describe('sample design yaml selection', () => {
  it('round-trips without spurious element diffs', () => {
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const parsed = tryParseYamlElements(yaml)!
    expect(elementsSequenceEqual(SAMPLE_ELEMENTS, parsed)).toBe(true)
  })

  it('keeps rectangle selection when fill changes in yaml', () => {
    const rectangleIndex = indexOfType('rectangle')
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const editedYaml = yaml.replace("fill: white", 'fill: r')
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SAMPLE_ELEMENTS, parsed, rectangleIndex)).toBe(rectangleIndex)
  })

  it('keeps text selection when color changes from jinja to r', () => {
    const templatedTextIndex = SAMPLE_ELEMENTS.findIndex(
      (element) =>
        element.type === 'text' &&
        'color' in element &&
        typeof element.color === 'string' &&
        element.color.includes('binary_sensor.door'),
    )
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const editedYaml = yaml.replace(
      `color: "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}"`,
      'color: r',
    )
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SAMPLE_ELEMENTS, parsed, templatedTextIndex)).toBe(templatedTextIndex)
  })

  it('keeps selection after property-panel round trip', () => {
    const titleTextIndex = indexOfType('text')
    const edited = SAMPLE_ELEMENTS.map((element, index) =>
      index === titleTextIndex && element.type === 'text'
        ? { ...element, color: 'r' as const }
        : element,
    )
    const yaml = serializeYamlPayload(edited)
    const parsed = tryParseYamlElements(yaml)!
    expect(elementsSequenceEqual(edited, parsed)).toBe(true)
    expect(remapSelectedIndex(edited, parsed, titleTextIndex)).toBe(titleTextIndex)
  })
})
