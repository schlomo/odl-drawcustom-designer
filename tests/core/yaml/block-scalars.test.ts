import { describe, expect, it } from 'vitest'
import { SAMPLE_ELEMENTS } from '../../../src/ui/data/sample-elements'
import {
  foldLinesAtDelimiter,
  foldLinesForJinjaTemplate,
  stringBlockScalarType,
} from '../../../src/core/yaml/blockScalars'
import { parseYamlPayload, roundTripYaml, serializeYamlPayload } from '../../../src/core/yaml'

describe('stringBlockScalarType', () => {
  it('uses literal block scalars for multiline strings', () => {
    expect(stringBlockScalarType('a\nb')).toBe('BLOCK_LITERAL')
    expect(stringBlockScalarType('short')).toBeNull()
  })

  it('uses literal block scalars for expression-only Jinja', () => {
    expect(stringBlockScalarType("{{ now().strftime('%H:%M') }}")).toBe('BLOCK_LITERAL')
  })

  it('uses folded block scalars for Jinja statement tags', () => {
    expect(stringBlockScalarType('{%- set t = now() -%} {{ t.strftime("%H:%M") }}')).toBe(
      'BLOCK_FOLDED',
    )
  })

  it('uses folded block scalars for long single-line strings', () => {
    expect(stringBlockScalarType('x'.repeat(80))).toBe('BLOCK_FOLDED')
    expect(stringBlockScalarType('x'.repeat(79))).toBeNull()
  })

  it('uses folded block scalars for multiline values with delimiter breaks', () => {
    expect(
      stringBlockScalarType('alpha /beta', {
        elementType: 'multiline',
        delimiter: '/',
      }),
    ).toBe('BLOCK_FOLDED')
  })
})

describe('foldLinesAtDelimiter', () => {
  it('splits at delimiter boundaries without changing the parsed value', () => {
    const value =
      'Advanced Online Editor including basic support for Home /Assistant template language and /image content.'
    expect(foldLinesAtDelimiter(value, '/')).toEqual([
      'Advanced Online Editor including basic support for Home',
      '/Assistant template language and',
      '/image content.',
    ])
  })
})

describe('foldLinesForJinjaTemplate', () => {
  it('splits statement and expression tags onto separate lines', () => {
    expect(foldLinesForJinjaTemplate("{%- set t = now() -%} {{ t.strftime('%H:%M') }}")).toEqual([
      '{%- set t = now() -%}',
      "{{ t.strftime('%H:%M') }}",
    ])
  })
})

describe('serializeYamlPayload block scalars', () => {
  it('emits |- for multiline values', () => {
    const exported = serializeYamlPayload([
      { type: 'text', value: 'line one\nline two', x: 0, y: 0 },
    ])
    expect(exported).toContain('value: |-')
    expect(exported).toContain('line one')
    expect(exported).toContain('line two')
  })

  it('emits |- for expression-only Jinja template values', () => {
    const exported = serializeYamlPayload([
      { type: 'text', value: "{{ now().strftime('%H:%M') }}", x: 0, y: 0 },
    ])
    expect(exported).toContain('value: |-')
    expect(exported).toContain("{{ now().strftime('%H:%M') }}")
    expect(exported).not.toContain('value: "{{ now()')
  })

  it('emits >- with trimmed Jinja statements on separate lines', () => {
    const exported = serializeYamlPayload([
      {
        type: 'text',
        value: "{%- set t = now() -%} {{ t.strftime('%H:%M') }}",
        x: 0,
        y: 0,
      },
    ])
    expect(exported).toContain('value: >-')
    expect(exported).toContain('{%- set t = now() -%}\n    {{ t.strftime')
    expect(parseYamlPayload(exported)[0]).toMatchObject({
      type: 'text',
      value: "{%- set t = now() -%} {{ t.strftime('%H:%M') }}",
    })
  })

  it('emits >- for long single-line values', () => {
    const exported = serializeYamlPayload([
      { type: 'text', value: 'x'.repeat(100), x: 0, y: 0 },
    ])
    expect(exported).toContain('value: >-')
  })

  it('reflows multiline element values at delimiter boundaries', () => {
    const value =
      'Advanced Online Editor for OpenDisplay and OpenEPaperlink displays including basic support for Home /Assistant template language, including simulation of HA states, common functions, custom fonts and /image content. Color mode preview. Supports ordering, layering, alignment, color mode, templating ...'
    const exported = serializeYamlPayload([
      {
        type: 'multiline',
        value,
        delimiter: '/',
        x: 40,
        y: 70,
      },
    ])
    expect(exported).toContain('value: >-')
    expect(exported).toContain('basic support for Home\n    /Assistant template language')
    expect(exported).toContain('custom fonts and\n    /image content.')
    expect(parseYamlPayload(exported)[0]).toMatchObject({ type: 'multiline', value })
  })

  it('serializes showcase demo data with block scalars', () => {
    const exported = serializeYamlPayload(SAMPLE_ELEMENTS)
    expect(exported).toContain('value: >-')
    expect(exported).toContain('{%- set t = now() -%}')
    expect(exported).toContain("{{ t.strftime('%H:%M') }}")
    expect(exported).toContain('delimiter: /')
    expect(exported).toContain('basic support for Home\n    /Assistant template language')
    expect(parseYamlPayload(exported)).toEqual(
      parseYamlPayload(serializeYamlPayload(SAMPLE_ELEMENTS)),
    )
  })

  it('round-trips hand-authored block scalar YAML', () => {
    const source = `- type: text
  value: |-
    alpha
    beta
  x: 0
  y: 0
`
    const roundTripped = roundTripYaml(source)
    expect(parseYamlPayload(roundTripped)).toEqual(parseYamlPayload(source))
    expect(roundTripped).toContain('value: |-')
  })

  it('round-trips folded Jinja block scalars with trim tags', () => {
    const source = `- type: text
  value: >-
    {%- set t = now() -%}
    {{ t.strftime('%H:%M') }}
  x: 0
`
    const roundTripped = roundTripYaml(source)
    expect(roundTripped).toContain('value: >-')
    expect(roundTripped).toContain('{%- set t = now() -%}')
    expect(parseYamlPayload(roundTripped)[0]).toMatchObject({
      type: 'text',
      value: "{%- set t = now() -%} {{ t.strftime('%H:%M') }}",
    })
  })

  it('round-trips folded block scalar YAML', () => {
    const source = `- type: text
  value: >-
    long folded
    content here
  x: 0
`
    expect(parseYamlPayload(roundTripYaml(source))).toEqual(parseYamlPayload(source))
  })
})
