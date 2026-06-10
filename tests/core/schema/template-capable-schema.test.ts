import { describe, expect, it } from 'vitest'
import {
  isTemplateStoredValue,
  roundTripYaml,
  validatePayload,
} from '../../../src/core'
import { elementSchemasByType } from '../../../src/core/schema/elements'
import { parseYamlPayload } from '../../../src/core/yaml'

const TEMPLATE = "{{ states('sensor.value') }}"

describe('template-capable schema', () => {
  it.each([
    ['text', { type: 'text', value: 'Hi', x: TEMPLATE, size: TEMPLATE }],
    ['progress_bar', {
      type: 'progress_bar',
      x_start: 0,
      y_start: 0,
      x_end: 100,
      y_end: 20,
      progress: TEMPLATE,
    }],
    ['polygon', { type: 'polygon', points: TEMPLATE }],
    ['icon_sequence', {
      type: 'icon_sequence',
      x: 0,
      y: 0,
      icons: TEMPLATE,
      size: 24,
    }],
    ['plot', { type: 'plot', data: TEMPLATE }],
    ['line', { type: 'line', x_start: 0, x_end: 100, visible: TEMPLATE }],
    ['rectangle', {
      type: 'rectangle',
      x_start: 0,
      x_end: 10,
      y_start: 0,
      y_end: 10,
      fill: TEMPLATE,
    }],
  ] as const)('accepts templated fields on %s', (_label, sample) => {
    const result = elementSchemasByType[sample.type].safeParse(sample)
    expect(result.success).toBe(true)
  })

  it('round-trips templated progress_bar, polygon points, and plot data without corruption', () => {
    const yaml = `- type: progress_bar
  x_start: 0
  y_start: 0
  x_end: 200
  y_end: 20
  progress: "{{ states('sensor.progress') | float(50) }}"
- type: polygon
  points: "{{ states('sensor.points') | from_json }}"
- type: plot
  data: "{{ states('sensor.plot') | from_json }}"
`
    const payload = parseYamlPayload(yaml)
    const validation = validatePayload(payload)
    expect(validation.success).toBe(true)
    if (!validation.success) {
      return
    }

    const roundTripped = roundTripYaml(yaml)
    expect(roundTripped).toContain("progress: \"{{ states('sensor.progress') | float(50) }}\"")
    expect(roundTripped).toContain("points: \"{{ states('sensor.points') | from_json }}\"")
    expect(roundTripped).toContain("data: \"{{ states('sensor.plot') | from_json }}\"")

    const elements = validation.data
    const progressBar = elements.find((element) => element.type === 'progress_bar')
    expect(progressBar?.type === 'progress_bar' && progressBar.progress).toBe(
      "{{ states('sensor.progress') | float(50) }}",
    )
    const polygon = elements.find((element) => element.type === 'polygon')
    expect(polygon?.type === 'polygon' && polygon.points).toBe(
      "{{ states('sensor.points') | from_json }}",
    )
    const plot = elements.find((element) => element.type === 'plot')
    expect(plot?.type === 'plot' && plot.data).toBe("{{ states('sensor.plot') | from_json }}")
  })

  it('detects template stored values', () => {
    expect(isTemplateStoredValue('{{ 1 }}')).toBe(true)
    expect(isTemplateStoredValue('{% if true %}1{% endif %}')).toBe(true)
    expect(isTemplateStoredValue('50')).toBe(false)
    expect(isTemplateStoredValue(50)).toBe(false)
  })
})
