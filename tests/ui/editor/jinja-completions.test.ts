import { describe, expect, it } from 'vitest'
import {
  HA_DELIMITER_COMPLETIONS,
  HA_EXPRESSION_COMPLETIONS,
  HA_FILTER_COMPLETIONS,
  HA_NOW_METHOD_COMPLETIONS,
  HA_TAG_COMPLETIONS,
  haJinjaCompletionSource,
  matchEntityCompletions,
  resolveJinjaCompletionContext,
} from '../../../src/ui/editor/jinjaCompletions'

function mockContext(doc: string, pos: number, explicit = false) {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const lineText = doc.slice(lineStart, doc.indexOf('\n', pos) === -1 ? doc.length : doc.indexOf('\n', pos))

  return {
    state: {
      doc: {
        toString: () => doc,
        lineAt: (p: number) => {
          const lines = doc.split('\n')
          let offset = 0
          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index] ?? ''
            const end = offset + line.length
            if (p <= end) {
              return { from: offset, text: line }
            }
            offset = end + 1
          }
          return { from: 0, text: lines[0] ?? '' }
        },
      },
      sliceDoc: (from: number, to: number) => doc.slice(from, to),
    },
    pos,
    explicit,
    matchBefore: (pattern: RegExp) => {
      const lineBefore = lineText.slice(0, pos - lineStart)
      const match = lineBefore.match(new RegExp(`(${pattern.source})$`))
      if (!match) {
        return null
      }
      const text = match[1] ?? match[0] ?? ''
      return { from: lineStart + lineBefore.length - text.length, to: pos, text }
    },
  } as never
}

describe('HA jinja completion catalog', () => {
  it('prioritizes homeassistant functions over generic jinja', () => {
    const labels = HA_EXPRESSION_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toContain('states')
    expect(labels).toContain('now')
    expect(labels).not.toContain('sameas')
    expect(labels).not.toContain('string')
  })

  it('offers state_attr and is_state_attr helpers', () => {
    const labels = HA_EXPRESSION_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(expect.arrayContaining(['state_attr', 'is_state_attr']))
    const isStateAttr = HA_EXPRESSION_COMPLETIONS.find((entry) => entry.label === 'is_state_attr')
    expect(isStateAttr?.detail).toContain('value')
  })

  it('includes now() strftime as the supported method', () => {
    const labels = HA_NOW_METHOD_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(['strftime'])
    expect(HA_NOW_METHOD_COMPLETIONS[0]?.detail).toContain('%H:%M')
  })

  it('includes homeassistant filters', () => {
    const labels = HA_FILTER_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(expect.arrayContaining(['float', 'int', 'round']))
  })

  it('includes statement tags used in drawcustom template strings', () => {
    const labels = HA_TAG_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(
      expect.arrayContaining(['set', 'if', 'elif', 'else', 'endif', 'for', 'endfor']),
    )
  })

  it('offers jinja delimiters after a lone open brace', () => {
    const labels = HA_DELIMITER_COMPLETIONS.map((entry) => entry.label)
    expect(labels).toEqual(['{{', '{%'])
  })
})

describe('resolveJinjaCompletionContext', () => {
  it('offers delimiters after a lone { in a yaml value', () => {
    const doc = '  y_start: 50 {'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'delimiter',
      from: pos,
      prefix: '',
    })
  })

  it('returns null after a plain quoted yaml value', () => {
    const doc = '  color: "red"'
    expect(resolveJinjaCompletionContext(mockContext(doc, doc.length))).toBeNull()
  })

  it('offers tag keywords right after opening {%', () => {
    const doc = '  size: 32 {%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: pos,
      prefix: '',
    })
  })

  it('matches partial tag keywords inside {%', () => {
    const doc = '  size: 32 {% se'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: doc.indexOf('se'),
      prefix: 'se',
    })
  })

  it('still resolves expression helpers inside {{', () => {
    const doc = '  value: "{{ stat'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'expression',
      from: doc.indexOf('stat'),
      prefix: 'stat',
    })
  })

  it('offers entity-id completions inside is_state_attr() first argument', () => {
    const doc = "  value: \"{{ is_state_attr('cal"
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'entity-id',
      from: doc.indexOf('cal'),
      prefix: 'cal',
    })
  })

  it('resolves now() method completions after the dot', () => {
    const doc = '  value: "{{ now().str'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'now-method',
      from: doc.indexOf('str'),
      prefix: 'str',
    })
  })

  it('offers now() methods right after now().', () => {
    const doc = '  value: "{{ now().'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'now-method',
      from: pos,
      prefix: '',
    })
  })

  it('offers strftime format codes after % inside strftime quotes', () => {
    const doc = '  x_end: |-\n    {{ now().strftime(\'%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 1,
      prefix: '',
    })
  })

  it('offers strftime format codes after a second consecutive %', () => {
    const doc = '  value: "{{ now().strftime(\'%H%M%'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 1,
      prefix: '',
    })
  })

  it('filters strftime format codes while typing the current specifier', () => {
    const doc = '  value: "{{ now().strftime(\'%H%M'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'strftime-format',
      from: pos - 2,
      prefix: 'M',
    })
  })

  it('resolves expression helpers inside an iif() argument position', () => {
    const doc = '  value: "{{ iif('
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: pos,
      prefix: '',
    })
  })

  it('resolves expression helpers after a comma inside iif()', () => {
    const doc = "  value: \"{{ iif(is_state('a.b', 'on'), "
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: pos,
      prefix: '',
    })
  })

  it('still matches a typed prefix inside an iif() argument', () => {
    const doc = '  value: "{{ iif(stat'
    const pos = doc.length
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, false))).toEqual({
      kind: 'expression',
      from: doc.indexOf('stat'),
      prefix: 'stat',
    })
  })

  it('resolves tag keywords inside a scaffolded {% %} block', () => {
    const doc = '  size: 32 {% %}'
    const pos = doc.indexOf('{%') + 2
    expect(resolveJinjaCompletionContext(mockContext(doc, pos, true))).toEqual({
      kind: 'tag',
      from: pos,
      prefix: '',
    })
  })
})

describe('entity-id completion matching (issue #170)', () => {
  const ENTITIES = [
    { id: 'sensor.wardrobe_outside_temperature', name: 'Wardrobe Temperature' },
    { id: 'sensor.hallway_humidity', name: 'Hallway Humidity' },
  ]

  function entityLabels(doc: string): string[] {
    const result = haJinjaCompletionSource(ENTITIES)(mockContext(doc, doc.length))
    return (result?.options ?? []).map((option) => option.label)
  }

  it('offers an entity whose id buries the fragment mid-string', () => {
    const labels = entityLabels("  value: \"{{ states('temp")
    expect(labels).toContain('sensor.wardrobe_outside_temperature')
    expect(labels).not.toContain('sensor.hallway_humidity')
  })

  it('offers the humidity sensor for a mid-id fragment', () => {
    const labels = entityLabels("  value: \"{{ states('hum")
    expect(labels).toEqual(['sensor.hallway_humidity'])
  })

  it('matches via the friendly name when the id never contains the fragment', () => {
    const entities = [{ id: 'climate.livingroom', name: 'Thermostat Downstairs' }]
    const result = haJinjaCompletionSource(entities)(
      mockContext("  value: \"{{ states('thermo", "  value: \"{{ states('thermo".length),
    )
    expect(result?.options.map((option) => option.label)).toEqual(['climate.livingroom'])
  })

  it('disables CodeMirror label re-filtering so friendly-name matches survive', () => {
    const doc = "  value: \"{{ states('temp"
    const result = haJinjaCompletionSource(ENTITIES)(mockContext(doc, doc.length))
    expect(result?.filter).toBe(false)
  })

  it('matches case-insensitively', () => {
    const labels = entityLabels("  value: \"{{ states('Temp")
    expect(labels).toContain('sensor.wardrobe_outside_temperature')
  })

  it('shows the friendly name as the completion detail', () => {
    const doc = "  value: \"{{ states('hum"
    const result = haJinjaCompletionSource(ENTITIES)(mockContext(doc, doc.length))
    expect(result?.options[0]?.detail).toBe('Hallway Humidity')
  })

  it('ranks prefix above token-start above plain substring', () => {
    const entries = [
      { id: 'sensor.attemperator' },
      { id: 'sensor.outside_temperature' },
      { id: 'sensor.kitchen', name: 'Temperature Kitchen' },
    ]
    const labels = matchEntityCompletions(entries, 'temp').map((option) => option.label)
    expect(labels).toEqual([
      'sensor.kitchen', // friendly name starts with the query
      'sensor.outside_temperature', // query starts a `_`-separated token
      'sensor.attemperator', // bare substring
    ])
  })

  it('ranks a boundary occurrence even when a non-boundary one comes first', () => {
    const entries = [
      { id: 'sensor.attempt_temperature' },
      { id: 'sensor.attemperator' },
    ]
    const labels = matchEntityCompletions(entries, 'temp').map((option) => option.label)
    expect(labels).toEqual(['sensor.attempt_temperature', 'sensor.attemperator'])
  })

  it('offers every entity for an empty fragment', () => {
    const labels = matchEntityCompletions(ENTITIES, '').map((option) => option.label)
    expect(labels).toEqual([
      'sensor.hallway_humidity',
      'sensor.wardrobe_outside_temperature',
    ])
  })

  it('still puts a true id prefix first', () => {
    const entries = [
      { id: 'sensor.outside_temperature' },
      { id: 'sensor.sensible' },
    ]
    const labels = matchEntityCompletions(entries, 'sens').map((option) => option.label)
    expect(labels[0]).toBe('sensor.outside_temperature')
    expect(labels).toContain('sensor.sensible')
  })
})

describe('friendly-name fragments in quoted entity arguments (PR #192 review)', () => {
  const FRIENDLY = [
    { id: 'binary_sensor.garage_door', name: 'Garage Entrance' },
    { id: 'sensor.kueche_temperatur', name: 'Küche Temperatur' },
    { id: 'light.wohnzimmer', name: 'Living-Room Lamp' },
  ]

  function completionResult(doc: string) {
    return haJinjaCompletionSource(FRIENDLY)(mockContext(doc, doc.length))
  }

  it('recognizes a fragment containing a space inside the quoted argument', () => {
    const doc = "  value: \"{{ states('garage en"
    expect(resolveJinjaCompletionContext(mockContext(doc, doc.length))).toEqual({
      kind: 'entity-id',
      from: doc.indexOf('garage en'),
      prefix: 'garage en',
    })
  })

  it('finds Garage Entrance for `garage en` and replaces the whole fragment', () => {
    const doc = "  value: \"{{ states('garage en"
    const result = completionResult(doc)
    expect(result?.options.map((option) => option.label)).toEqual(['binary_sensor.garage_door'])
    // Accepting must replace the WHOLE typed fragment — `from` at the quote,
    // not at the last word — or `garage ` is left behind before the id.
    expect(result?.from).toBe(doc.indexOf('garage en'))
  })

  it('finds a non-ASCII friendly name automatically (no explicit trigger)', () => {
    const doc = "  value: \"{{ states('kü"
    const result = completionResult(doc)
    expect(result?.options.map((option) => option.label)).toEqual(['sensor.kueche_temperatur'])
    expect(result?.from).toBe(doc.indexOf('kü'))
  })

  it('finds a hyphenated friendly name', () => {
    const doc = "  value: \"{{ states('living-r"
    const result = completionResult(doc)
    expect(result?.options.map((option) => option.label)).toEqual(['light.wohnzimmer'])
  })

  it('stops the fragment at the previous closing quote (is_state second argument)', () => {
    const doc = "  value: \"{{ is_state('binary_sensor.garage_door', 'garage en"
    expect(resolveJinjaCompletionContext(mockContext(doc, doc.length))).toEqual({
      kind: 'entity-id',
      from: doc.lastIndexOf('garage en'),
      prefix: 'garage en',
    })
  })

  it('does not complete spaced fragments outside quotes', () => {
    const doc = '  value: "{{ states(garage en'
    expect(completionResult(doc)).toBeNull()
  })
})
