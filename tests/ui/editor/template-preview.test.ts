import { describe, expect, it } from 'vitest'
import {
  findTemplatePreviewAnchors,
  formatTemplatePreviewError,
  formatTemplatePreviewLabel,
  simplifyTemplateErrorMessage,
  TEMPLATE_PREVIEW_MAX_LENGTH,
} from '../../../src/ui/editor/templatePreviewAnchors'
import { buildTemplatePreviewDecorations } from '../../../src/ui/editor/yamlTemplatePreview'

const protectionWindowOn = {
  states: { 'binary_sensor.openuv_protection_window': 'on' },
}

const protectionWindowOff = {
  states: { 'binary_sensor.openuv_protection_window': 'off' },
}

describe('template preview anchors', () => {
  it('evaluates iif fill templates from State Simulator context', () => {
    const doc = `fill: "{{ iif(is_state('binary_sensor.openuv_protection_window', 'on'), 'black', 'none') }}"`

    expect(findTemplatePreviewAnchors(doc, protectionWindowOn)).toEqual([
      { pos: doc.length, preview: 'black' },
    ])
    expect(findTemplatePreviewAnchors(doc, protectionWindowOff)).toEqual([
      { pos: doc.length, preview: 'none' },
    ])
  })

  it('evaluates visible iif templates', () => {
    const doc = `visible: "{{ iif(is_state('binary_sensor.openuv_protection_window', 'on'), true, false) }}"`

    expect(findTemplatePreviewAnchors(doc, protectionWindowOn)).toEqual([
      { pos: doc.length, preview: 'true' },
    ])
    expect(findTemplatePreviewAnchors(doc, protectionWindowOff)).toEqual([
      { pos: doc.length, preview: 'false' },
    ])
  })

  it('finds multiple quoted templates on one line', () => {
    const doc =
      'value: "{{ states(\'sensor.a\') }}" color: "{{ states(\'sensor.b\') }}"'
    const anchors = findTemplatePreviewAnchors(doc, {
      states: { 'sensor.a': 'hello', 'sensor.b': 'world' },
    })

    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('hello')
    expect(anchors[1]?.preview).toBe('world')
    expect(anchors[0]?.pos).toBeLessThan(anchors[1]?.pos ?? 0)
  })

  it('ignores plain quoted strings and multiline template strings', () => {
    const doc = `value: "plain"
fill: "{{ states('sensor.a') }}"
note: "{{ states('sensor.b')
  }}"
`

    const anchors = findTemplatePreviewAnchors(doc, { states: { 'sensor.a': 'red' } })
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.preview).toBe('red')
  })

  it('truncates long preview labels', () => {
    const long = 'x'.repeat(TEMPLATE_PREVIEW_MAX_LENGTH + 10)
    expect(formatTemplatePreviewLabel(long)).toBe(`${'x'.repeat(TEMPLATE_PREVIEW_MAX_LENGTH - 1)}…`)
  })

  it('shows a short evaluator message for template errors', () => {
    const doc = `progress: "{{ round(now().strftime('%S')) }}"`
    const anchors = findTemplatePreviewAnchors(doc, { states: {}, now: new Date(2026, 5, 6, 12, 0, 30) })
    expect(anchors[0]?.preview).toContain('[error]')
    expect(anchors[0]?.preview).toContain('Unable to call `round`')
    expect(anchors[0]?.tooltip).toContain('Unable to call `round`')
  })

  it('simplifies nunjucks error noise', () => {
    expect(
      simplifyTemplateErrorMessage(
        "(unknown path)\n  Error: Unable to call `round`, which is undefined or falsey",
      ),
    ).toBe('Unable to call `round`, which is undefined or falsey')
  })

  it('formats template preview errors with truncation', () => {
    const long = `Unable to call ${'round'} ${'x'.repeat(TEMPLATE_PREVIEW_MAX_LENGTH)}`
    expect(formatTemplatePreviewError(new Error(long))).toMatch(/^\[error\] Unable to call round/)
  })

  it('keeps the full error message in tooltip metadata', () => {
    const doc = `value: "{{ tates('sensor.temp') }}"`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors[0]?.preview).toMatch(/^\[error\] Unable to call/)
    expect(anchors[0]?.tooltip).toContain('Unable to call `tates`')
  })
})

describe('template preview decorations', () => {
  it('builds widget decorations when enabled', () => {
    const doc = `fill: "{{ iif(is_state('binary_sensor.openuv_protection_window', 'on'), 'black', 'none') }}"`
    const decorations = buildTemplatePreviewDecorations(doc, {
      enabled: true,
      context: protectionWindowOff,
    })

    expect(decorations.size).toBe(1)
  })

  it('returns none when preview is disabled', () => {
    const doc = `fill: "{{ states('sensor.a') }}"`
    const decorations = buildTemplatePreviewDecorations(doc, {
      enabled: false,
      context: { states: { 'sensor.a': 'red' } },
    })

    expect(decorations.size).toBe(0)
  })
})
