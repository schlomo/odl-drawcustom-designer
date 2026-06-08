import { describe, expect, it } from 'vitest'
import {
  DRAW_ELEMENT_TYPES,
  ENUMS,
  PROPERTIES_BY_TYPE,
  getElementTypeCompletions,
  getEnumCompletions,
  getPropertyCompletions,
  getServiceOptionCompletions,
} from '../../src/core/schema'
import {
  parseYamlPayload,
  serializeYamlPayload,
  validatePayload,
  validateServiceOptions,
} from '../../src/core/yaml'

describe('validatePayload', () => {
  it('accepts a valid text element', () => {
    const result = validatePayload([
      {
        type: 'text',
        value: 'Hello',
        x: 0,
        y: 0,
      },
    ])
    expect(result.success).toBe(true)
  })

  it('rejects unknown element keys', () => {
    const result = validatePayload([
      {
        type: 'text',
        value: 'Hello',
        x: 0,
        y: 0,
        not_a_field: true,
      },
    ])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some((issue) => issue.includes('not_a_field'))).toBe(true)
    }
  })

  it('rejects invalid element type', () => {
    const result = validatePayload([
      {
        type: 'unknown_type',
        value: 'x',
      },
    ])
    expect(result.success).toBe(false)
  })

  it('ignores designer-only fields during validation', () => {
    const result = validatePayload([
      {
        type: 'text',
        value: 'Hello',
        x: 0,
        y: 0,
        preview_data_url: 'data:image/png;base64,abc',
        _designer_note: 'internal',
      },
    ])
    expect(result.success).toBe(true)
  })

  it('validates percentage coordinates', () => {
    const result = validatePayload([
      {
        type: 'text',
        value: 'Centered',
        x: '50%',
        y: '50%',
        anchor: 'mm',
      },
    ])
    expect(result.success).toBe(true)
  })

  it('validates hex colors', () => {
    const result = validatePayload([
      {
        type: 'line',
        x_start: 0,
        x_end: 100,
        fill: '#F00',
      },
    ])
    expect(result.success).toBe(true)
  })

  it('accepts Jinja template strings in color fields', () => {
    const result = validatePayload([
      {
        type: 'text',
        value: 'Status',
        x: 0,
        y: 0,
        color: "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}",
      },
    ])
    expect(result.success).toBe(true)
  })

  it('accepts Jinja template strings in icon size', () => {
    const result = validatePayload([
      {
        type: 'icon',
        value: 'mdi:sunglasses',
        x: 0,
        y: 0,
        size: "{{ (float(states('sensor.example_metric'), 0) * 7 + 24) | round(0) }}",
        fill: 'black',
      },
    ])
    expect(result.success).toBe(true)
  })

  it('accepts Jinja template strings in visible', () => {
    const result = validatePayload([
      {
        type: 'icon',
        value: 'mdi:sunglasses',
        x: 0,
        y: 0,
        size: 24,
        visible: "{{ iif(is_state('binary_sensor.openuv_protection_window', 'on'), true, false) }}",
      },
    ])
    expect(result.success).toBe(true)
  })

  it('accepts Jinja template strings in enum option fields', () => {
    const result = validatePayload([
      {
        type: 'dlimg',
        url: '/local/bg.png',
        x: 0,
        y: 0,
        xsize: 565,
        ysize: 480,
        resize_method: '{{ r }}',
      },
      {
        type: 'icon_sequence',
        x: 0,
        y: 0,
        icons: ['mdi:home'],
        size: 24,
        direction: "{{ 'right' if is_state('binary_sensor.door', 'on') else 'left' }}",
      },
    ])
    expect(result.success).toBe(true)
  })

  it('rejects unknown icon names', () => {
    const result = validatePayload([
      {
        type: 'icon',
        value: 'not-a-real-mdi-icon',
        x: 0,
        y: 0,
        size: 24,
      },
    ])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some((issue) => issue.includes('Unknown Material Design icon name'))).toBe(
        true,
      )
    }
  })

  it('accepts templated icon names without MDI lookup', () => {
    const result = validatePayload([
      {
        type: 'icon',
        value: "{{ 'mdi:home' if is_state('binary_sensor.door', 'on') else 'mdi:alert' }}",
        x: 0,
        y: 0,
        size: 24,
      },
    ])
    expect(result.success).toBe(true)
  })

  it('rejects unknown names in icon_sequence icons', () => {
    const result = validatePayload([
      {
        type: 'icon_sequence',
        x: 0,
        y: 0,
        icons: ['home', 'not-a-real-mdi-icon'],
        size: 24,
      },
    ])
    expect(result.success).toBe(false)
  })
})

describe('validateServiceOptions', () => {
  it('accepts valid service options', () => {
    const result = validateServiceOptions({
      background: 'white',
      rotate: 0,
      dither: 2,
      ttl: 60,
      'dry-run': false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown service keys', () => {
    const result = validateServiceOptions({
      background: 'white',
      payload: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('serializeYamlPayload HA-clean export', () => {
  it('never emits designer-only fields even when present in memory', () => {
    const yaml = serializeYamlPayload([
      {
        type: 'dlimg',
        url: '/local/logo.png',
        x: 0,
        y: 0,
        xsize: 64,
        ysize: 64,
        preview_data_url: 'data:image/png;base64,abc',
      } as never,
    ])

    expect(yaml).not.toMatch(/preview_data_url/)
    expect(yaml).not.toMatch(/^_/m)
  })
})

describe('schema completion metadata', () => {
  it('covers all 16 draw element types', () => {
    expect(DRAW_ELEMENT_TYPES).toHaveLength(16)
    expect(getElementTypeCompletions()).toHaveLength(16)
  })

  it('exports properties for every element type', () => {
    for (const type of DRAW_ELEMENT_TYPES) {
      expect(PROPERTIES_BY_TYPE[type].length).toBeGreaterThan(0)
      expect(getPropertyCompletions(type).length).toBe(PROPERTIES_BY_TYPE[type].length)
    }
  })

  it('exports service option completions', () => {
    expect(getServiceOptionCompletions().map((entry) => entry.label)).toEqual([
      'background',
      'rotate',
      'dither',
      'ttl',
      'dry-run',
    ])
  })

  it('exports enum values for editor autocomplete', () => {
    expect(getEnumCompletions('color').length).toBe(ENUMS.color.length)
    expect(getEnumCompletions('direction').length).toBe(4)
  })
})

describe('parseYamlPayload with templates', () => {
  it('preserves template strings verbatim in parsed output', () => {
    const source = `- type: text
  value: "{{ states('sensor.temperature') }}°C"
  x: 10
  y: 10
`
    const elements = parseYamlPayload(source)
    expect(elements[0].value).toBe("{{ states('sensor.temperature') }}°C")
    expect(validatePayload(elements).success).toBe(true)
  })
})
