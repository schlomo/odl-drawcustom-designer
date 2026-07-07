import { describe, expect, it } from 'vitest'
import type { HaMockContext } from '../../../src/core'
import { DRAW_ELEMENT_TYPES, evaluateTemplate, parseYamlPayload, validatePayload } from '../../../src/core'
import {
  SHOWCASE_CANVAS,
  SHOWCASE_ELEMENTS,
  SHOWCASE_JSON_PATH,
  SHOWCASE_MOCK_ATTRIBUTES,
  SHOWCASE_MOCK_STATES,
  SHOWCASE_VARIABLES,
  SHOWCASE_YAML,
  SHOWCASE_YAML_PATH,
} from '../../../src/ui/data/showcase'

const showcaseContext: HaMockContext = {
  states: { ...SHOWCASE_MOCK_STATES },
  attributes: structuredClone(SHOWCASE_MOCK_ATTRIBUTES),
  variables: { ...SHOWCASE_VARIABLES },
}

function elementsWithStringField(field: string): string[] {
  const values: string[] = []
  for (const element of SHOWCASE_ELEMENTS) {
    const value = (element as Record<string, unknown>)[field]
    if (typeof value === 'string') {
      values.push(value)
    }
  }
  return values
}

function findFieldValue(field: string, needle: string): string {
  const match = elementsWithStringField(field).find((value) => value.includes(needle))
  if (!match) {
    throw new Error(`No showcase element has a "${field}" containing ${JSON.stringify(needle)}`)
  }
  return match
}

describe('showcase bundle (src/assets/showcase/)', () => {
  it('parses and validates showcase.yml', () => {
    const parsed = parseYamlPayload(SHOWCASE_YAML)
    const validation = validatePayload(parsed)
    expect(validation.success, SHOWCASE_YAML_PATH).toBe(true)
    expect(parsed).toEqual(SHOWCASE_ELEMENTS)
  })

  it('loads canvas and simulator seed from showcase.json', () => {
    expect(SHOWCASE_CANVAS).toMatchObject({ width: 800, height: 480, colorMode: 'four' })
    expect(SHOWCASE_MOCK_STATES['sensor.temperature']).toBe('21.5')
    expect(SHOWCASE_MOCK_ATTRIBUTES['weather.home']).toMatchObject({ temperature: 18, humidity: 64 })
    expect(SHOWCASE_VARIABLES).toMatchObject({ accent_color: 'red', alert: 'true' })
    expect(SHOWCASE_JSON_PATH).toBe('src/assets/showcase/showcase.json')
  })

  it('includes every supported element type', () => {
    const types = new Set(SHOWCASE_ELEMENTS.map((element) => element.type))
    expect([...types].sort()).toEqual([...DRAW_ELEMENT_TYPES].sort())
  })

  it('matches the layout coordinates from showcase.yml', () => {
    const icon = SHOWCASE_ELEMENTS.find((element) => element.type === 'icon')
    expect(icon).toMatchObject({ x: 156, y: 270, size: 71 })
    const tempLine = SHOWCASE_ELEMENTS.find(
      (element) =>
        element.type === 'text' &&
        typeof element.value === 'string' &&
        element.value.includes("state_attr('weather.home'"),
    )
    expect(tempLine).toMatchObject({ x: 500, y: 32 })
  })

  describe('template features demonstrated by the bundle', () => {
    it('resolves is_state_attr with a typed boolean attribute (icon choice)', () => {
      const iconValue = findFieldValue('value', 'iif(is_state_attr(')
      expect(evaluateTemplate(iconValue, showcaseContext).trim()).toBe('mdi:thermometer')
    })

    it('resolves state_attr alongside states()', () => {
      const tempValue = findFieldValue('value', "state_attr('weather.home'")
      const rendered = evaluateTemplate(tempValue, showcaseContext)
      expect(rendered).toContain('21.5')
      expect(rendered).toContain('18')
    })

    it('resolves within-field namespace() and dotted attribute access', () => {
      const nsValue = findFieldValue('value', 'set ns = namespace(')
      expect(evaluateTemplate(nsValue, showcaseContext).trim()).toBe('Avg 21.5°C · Hum 64%')
    })

    it('resolves cross-field Simulator variables in multiple fields', () => {
      const accentColors = [
        ...elementsWithStringField('fill'),
        ...elementsWithStringField('color'),
      ].filter((value) => value.includes('accent_color'))
      expect(accentColors.length).toBeGreaterThanOrEqual(2)
      for (const value of accentColors) {
        expect(evaluateTemplate(value, showcaseContext).trim()).toBe('red')
      }
    })

    it('resolves a typed boolean variable controlling fill color', () => {
      const alertFill = findFieldValue('fill', 'alert')
      expect(evaluateTemplate(alertFill, showcaseContext).trim()).toBe('red')
    })
  })
})
