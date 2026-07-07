import { describe, expect, it } from 'vitest'
import { serializeYamlPayload } from '../../../src/core'
import { SHOWCASE_ELEMENTS } from '../../../src/ui/data/showcase'
import {
  elementsSequenceEqual,
  remapSelectedIndex,
  tryParseYamlElements,
} from '../../../src/ui/editor/yamlElementsSync'

function indexOfType(type: (typeof SHOWCASE_ELEMENTS)[number]['type']): number {
  return SHOWCASE_ELEMENTS.findIndex((element) => element.type === type)
}

describe('sample design yaml selection', () => {
  it('round-trips without spurious element diffs', () => {
    const yaml = serializeYamlPayload(SHOWCASE_ELEMENTS)
    const parsed = tryParseYamlElements(yaml)!
    expect(elementsSequenceEqual(SHOWCASE_ELEMENTS, parsed)).toBe(true)
  })

  it('keeps rectangle selection when fill changes in yaml', () => {
    const rectangleIndex = indexOfType('rectangle')
    const yaml = serializeYamlPayload(SHOWCASE_ELEMENTS)
    const editedYaml = yaml.replace("fill: white", 'fill: r')
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SHOWCASE_ELEMENTS, parsed, rectangleIndex)).toBe(rectangleIndex)
  })

  it('keeps text selection when color changes from jinja to r', () => {
    const templatedTextIndex = SHOWCASE_ELEMENTS.findIndex(
      (element) =>
        element.type === 'text' &&
        'color' in element &&
        typeof element.color === 'string' &&
        element.color.includes('binary_sensor.door'),
    )
    const yaml = serializeYamlPayload(SHOWCASE_ELEMENTS)
    const editedYaml = yaml.replace(
      `color: "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}"`,
      'color: r',
    )
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SHOWCASE_ELEMENTS, parsed, templatedTextIndex)).toBe(templatedTextIndex)
  })

  it('keeps selection after property-panel round trip', { timeout: 15_000 }, () => {
    const titleTextIndex = indexOfType('text')
    const edited = SHOWCASE_ELEMENTS.map((element, index) =>
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
