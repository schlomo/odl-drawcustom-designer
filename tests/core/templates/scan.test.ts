import { describe, expect, it } from 'vitest'
import { scanPayloadForTemplates } from '../../../src/core/templates'
import type { DrawElement } from '../../../src/core/schema/elements'

describe('scanPayloadForTemplates', () => {
  it('finds templates and entity IDs in a temperature text element', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: "Temperature: {{ states('sensor.temperature') }}°C",
        x: 10,
        y: 10,
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual(['sensor.temperature'])
    expect(result.references).toHaveLength(1)
    expect(result.references[0]).toMatchObject({
      path: '[0].value',
      raw: "Temperature: {{ states('sensor.temperature') }}°C",
    })
    expect(result.references[0].expressions).toContain("{{ states('sensor.temperature') }}")
  })

  it('finds entities from is_state and parse_colors templates', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: `[{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}]{{ states('binary_sensor.door') }}[/{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}]`,
        parse_colors: true,
        x: 10,
        y: 10,
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual(['binary_sensor.door'])
    expect(result.references[0].expressions.length).toBeGreaterThan(0)
  })

  it('finds battery entities in icon color and text value fields', () => {
    const payload: DrawElement[] = [
      {
        type: 'icon',
        value: 'mdi:battery',
        x: 10,
        y: 10,
        size: 24,
        color: "{{ 'red' if states('sensor.battery')|float < 20 else 'black' }}",
      },
      {
        type: 'text',
        value: "{{ states('sensor.battery') }}%",
        x: 40,
        y: 10,
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual(['sensor.battery'])
    expect(result.references.map((ref) => ref.path)).toEqual(['[0].color', '[1].value'])
  })

  it('scans nested plot legend format for templates', () => {
    const payload: DrawElement[] = [
      {
        type: 'plot',
        x_start: 0,
        x_end: 100,
        y_start: 0,
        y_end: 50,
        data: [{ entity: 'sensor.power' }],
        ylegend: {
          format: "{{ states('sensor.power') }} W",
        },
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual(['sensor.power'])
    expect(result.references.some((ref) => ref.path.includes('ylegend'))).toBe(true)
  })

  it('returns empty results for payloads without templates', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: 'Static label',
        x: 0,
        y: 0,
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual([])
    expect(result.references).toEqual([])
  })

  it('deduplicates entity IDs across elements', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: "{{ states('sensor.living_room_temperature') }}°C",
        x: 35,
        y: 40,
      },
      {
        type: 'text',
        value: "{{ states('sensor.living_room_temperature') }}",
        x: 10,
        y: 10,
      },
    ]

    const result = scanPayloadForTemplates(payload)

    expect(result.entityIds).toEqual(['sensor.living_room_temperature'])
    expect(result.references).toHaveLength(2)
  })
})
