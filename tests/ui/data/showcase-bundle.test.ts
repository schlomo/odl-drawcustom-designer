import { readFileSync } from 'node:fs'
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
import { buildContentAssetRows } from '../../../src/ui/lib/content-asset-rows'
import { getMissingAssetMessages } from '../../../src/ui/lib/missing-asset-messages'
import {
  SHOWCASE_BITMAP,
  SHOWCASE_PNG_PATH,
  decodeMonoPng,
  pngDataUri,
} from '../../../tools/showcaseImage'

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
    expect(SHOWCASE_MOCK_STATES['weather.forecast_home']).toBe('sunny')
    expect(SHOWCASE_MOCK_ATTRIBUTES['weather.forecast_home']).toMatchObject({ temperature: 18, humidity: 64 })
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
        element.value.includes("state_attr('weather.forecast_home', 'temperature')"),
    )
    expect(tempLine).toMatchObject({ x: 500, y: 32 })
  })

  describe('template features demonstrated by the bundle', () => {
    it('resolves is_state_attr with a typed boolean attribute (icon choice)', () => {
      const iconValue = findFieldValue('value', 'iif(is_state_attr(')
      expect(evaluateTemplate(iconValue, showcaseContext).trim()).toBe('mdi:thermometer')
    })

    it('resolves state_attr alongside states()', () => {
      const tempValue = findFieldValue('value', "state_attr('weather.forecast_home', 'temperature')")
      const rendered = evaluateTemplate(tempValue, showcaseContext)
      expect(rendered).toContain('21.5')
      expect(rendered).toContain('18')
    })

    it('resolves within-field namespace() and a tolerant state_attr read', () => {
      const nsValue = findFieldValue('value', 'set ns = namespace(')
      expect(evaluateTemplate(nsValue, showcaseContext).trim()).toBe('Avg 21.5°C · Hum 64%')
    })

    it('degrades to "?" instead of raising on a host without the weather entity', () => {
      const nsValue = findFieldValue('value', 'set ns = namespace(')
      const bareHost: HaMockContext = { states: {}, attributes: {}, variables: {} }
      expect(evaluateTemplate(nsValue, bareHost).trim()).toBe('Avg 21.5°C · Hum ?%')
    })

    it('keeps a real humidity of 0 instead of falling back to "?"', () => {
      const nsValue = findFieldValue('value', 'set ns = namespace(')
      const dryAir: HaMockContext = {
        ...showcaseContext,
        attributes: { 'weather.forecast_home': { temperature: 18, humidity: 0 } },
      }
      expect(evaluateTemplate(nsValue, dryAir).trim()).toBe('Avg 21.5°C · Hum 0%')
    })

    it('uses no direct states.<domain>.<object>.attributes chain (raises server-side when the entity is missing)', () => {
      const chain = /states\.\w+\.\w+\.attributes/
      expect(SHOWCASE_YAML).not.toMatch(chain)
    })

    it('references only the stock Home Assistant weather entity', () => {
      expect(SHOWCASE_YAML).not.toContain('weather.home')
      expect(SHOWCASE_YAML).toContain('weather.forecast_home')
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

/**
 * The demo bundle is designer-authored content, not an import — it is held to
 * the explicit standard here instead of being normalized at load time, so a
 * `y`-less element added to `showcase.yml` fails this test rather than
 * silently acquiring a zero (see `docs/spec/odl-gap-report.md`).
 */
describe('showcase bundle vertical coordinates', () => {
  it('never relies on the HA document-flow cursor', () => {
    const cursorPositioned = SHOWCASE_ELEMENTS.filter((element) => {
      const record = element as Record<string, unknown>
      if (element.type === 'text' || element.type === 'multiline') {
        return record.y === undefined
      }
      return element.type === 'line' && record.y_start === undefined
    })

    expect(cursorPositioned).toEqual([])
  })
})

/**
 * The demo's `dlimg` carries its picture inline as a `data:` URI, so the demo
 * sends to a real display through odl-renderer with no file on the Home
 * Assistant host — `/local/showcase.png` was a designer-only key that Pillow
 * treated as a filesystem path ("Image file not found"). The PNG is committed
 * next to the YAML and regenerated by `tools/showcaseImage.ts`; this pins all
 * three (bitmap, PNG, YAML) to each other.
 */
describe('showcase dlimg image (inline data: URI)', () => {
  const png = readFileSync(SHOWCASE_PNG_PATH)
  const dlimg = SHOWCASE_ELEMENTS.find((element) => element.type === 'dlimg')

  it('keeps the dlimg geometry and carries the committed showcase.png as a single-line data: URI', () => {
    expect(dlimg).toMatchObject({ x: 330, y: 260, xsize: 100, ysize: 100 })
    expect(dlimg?.url).toBe(pngDataUri(png))
    expect(dlimg?.url).not.toMatch(/\s/)
    expect(SHOWCASE_YAML).toContain(`url: ${pngDataUri(png)}\n`)
  })

  it('is a tiny 1-bit PNG that decodes to the generator bitmap, with ink in it', () => {
    expect(png.length).toBeLessThanOrEqual(250)
    const decoded = decodeMonoPng(png)
    expect(decoded.width).toBeLessThanOrEqual(32)
    expect(decoded.height).toBeLessThanOrEqual(32)
    expect(decoded.rows).toEqual(SHOWCASE_BITMAP)
    expect(decoded.rows.join('')).toContain('#')
  })

  it('needs nothing from the Content Manager: no image row, no missing-asset banner', () => {
    expect(buildContentAssetRows(SHOWCASE_ELEMENTS, 'current').filter((row) => row.kind === 'image')).toEqual([])
    expect(getMissingAssetMessages(SHOWCASE_ELEMENTS)).toEqual([])
  })
})
