import { describe, expect, it } from 'vitest'
import { normalizeIconElement, normalizePayload } from '../../../src/core/schema/normalizeElements'
import { serializeYamlPayload, validatePayload } from '../../../src/core/yaml'

describe('normalizeIconElement', () => {
  it('moves color to fill when fill is omitted', () => {
    const normalized = normalizeIconElement({
      type: 'icon',
      value: 'home',
      x: 0,
      y: 0,
      size: 24,
      color: 'red',
    })

    expect(normalized).toEqual({
      type: 'icon',
      value: 'home',
      x: 0,
      y: 0,
      size: 24,
      fill: 'red',
    })
    expect(normalized).not.toHaveProperty('color')
  })

  it('keeps fill and drops color when both are set', () => {
    const normalized = normalizeIconElement({
      type: 'icon',
      value: 'home',
      x: 0,
      y: 0,
      size: 24,
      fill: 'yellow',
      color: 'red',
    })

    expect(normalized.fill).toBe('yellow')
    expect(normalized).not.toHaveProperty('color')
  })

  it('leaves icons without color unchanged', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 20,
      size: 24,
      fill: 'black',
    }
    expect(normalizeIconElement(element)).toEqual(element)
  })
})

describe('validatePayload icon color import', () => {
  it('normalizes color to fill on successful validation', () => {
    const result = validatePayload([
      {
        type: 'icon',
        value: 'account-cowboy-hat',
        x: 170,
        y: 176,
        size: 120,
        color: 'red',
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data[0]).toMatchObject({
      type: 'icon',
      fill: 'red',
    })
    expect(result.data[0]).not.toHaveProperty('color')
  })
})

describe('serializeYamlPayload icon color', () => {
  it('serializes only fill after normalization', () => {
    const yaml = serializeYamlPayload(
      normalizePayload([
        {
          type: 'icon',
          value: 'home',
          x: 0,
          y: 0,
          size: 24,
          color: 'red',
        },
      ]),
    )

    expect(yaml).toContain('fill: red')
    expect(yaml).not.toContain('color:')
  })
})
