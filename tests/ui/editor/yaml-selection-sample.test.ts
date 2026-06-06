import { describe, expect, it } from 'vitest'
import { serializeYamlPayload } from '../../../src/core'
import { SAMPLE_ELEMENTS } from '../../../src/ui/data/sample-elements'
import {
  elementsSequenceEqual,
  remapSelectedIndex,
  tryParseYamlElements,
} from '../../../src/ui/editor/yamlElementsSync'

describe('sample design yaml selection', () => {
  it('round-trips without spurious element diffs', () => {
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const parsed = tryParseYamlElements(yaml)!
    expect(elementsSequenceEqual(SAMPLE_ELEMENTS, parsed)).toBe(true)
  })

  it('keeps rectangle selection when fill changes in yaml', () => {
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const editedYaml = yaml.replace("fill: white", 'fill: r')
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SAMPLE_ELEMENTS, parsed, 1)).toBe(1)
  })

  it('keeps text selection when color changes from jinja to r', () => {
    const yaml = serializeYamlPayload(SAMPLE_ELEMENTS)
    const editedYaml = yaml.replace(
      `color: "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}"`,
      'color: r',
    )
    const parsed = tryParseYamlElements(editedYaml)!
    expect(remapSelectedIndex(SAMPLE_ELEMENTS, parsed, 0)).toBe(0)
  })

  it('keeps selection after property-panel round trip', () => {
    const edited = SAMPLE_ELEMENTS.map((element, index) =>
      index === 0 ? { ...element, color: 'r' as const } : element,
    )
    const yaml = serializeYamlPayload(edited)
    const parsed = tryParseYamlElements(yaml)!
    expect(elementsSequenceEqual(edited, parsed)).toBe(true)
    expect(remapSelectedIndex(edited, parsed, 0)).toBe(0)
  })
})
