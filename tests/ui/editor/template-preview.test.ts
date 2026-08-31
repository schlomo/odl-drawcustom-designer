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

  // Issue #168: HA's automation editor emits single-quoted YAML scalars with
  // doubled `''` escaping for an embedded literal quote — valid YAML, and the
  // exact style real payloads pasted from HA use. The previous regex-based
  // extractor read raw editor text and didn't understand YAML's `''` escape at
  // all, so it sliced a garbled, unbalanced fragment and blew up evaluating it.
  it('evaluates HA-style single-quoted scalars with doubled \'\' escaping (issue #168)', () => {
    const doc = `value: '{{ states(''sensor.jewish_calendar_date'') }}'`
    const anchors = findTemplatePreviewAnchors(doc, {
      states: { 'sensor.jewish_calendar_date': '15 Elul 5786' },
    })

    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.preview).toBe('15 Elul 5786')
    expect(anchors[0]?.pos).toBe(doc.length)
  })

  it('evaluates now().strftime inside an HA-style \'\'-escaped single-quoted scalar (issue #168)', () => {
    const doc = `value: '{{ now().strftime(''%d.%m.%Y %H:%M'') }}'`
    const anchors = findTemplatePreviewAnchors(doc, {
      states: {},
      now: new Date(2026, 7, 31, 9, 5),
    })

    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.preview).toBe('31.08.2026 09:05')
  })

  it('agrees with the double-quoted equivalent for the same HA payload (issue #168)', () => {
    const singleQuoted = `value: '{{ states(''sensor.jewish_calendar_date'') }}'`
    const doubleQuoted = `value: "{{ states('sensor.jewish_calendar_date') }}"`
    const context = { states: { 'sensor.jewish_calendar_date': '15 Elul 5786' } }

    expect(findTemplatePreviewAnchors(singleQuoted, context)[0]?.preview).toBe(
      findTemplatePreviewAnchors(doubleQuoted, context)[0]?.preview,
    )
  })

  it('still finds a plain double-quoted template alongside an HA-escaped one (issue #168)', () => {
    const doc =
      "value: '{{ states(''sensor.jewish_calendar_date'') }}' color: \"{{ states('sensor.b') }}\""
    const anchors = findTemplatePreviewAnchors(doc, {
      states: { 'sensor.jewish_calendar_date': 'A', 'sensor.b': 'B' },
    })

    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.preview).toBe('A')
    expect(anchors[1]?.preview).toBe('B')
  })

  // F1 (review of #172): mid-typing an HA-escaped scalar must not surface an
  // anchor at all, let alone one showing the raw #168 error text — that
  // would read to the maintainer as "still broken".
  it('shows no anchor for an unterminated double-quoted scalar mid-typing (F1)', () => {
    const doc = `value: "{{ states('sensor.a`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it("shows no anchor for a single-quoted scalar mid-typing an HA-escaped '' quote (F1)", () => {
    const doc = `value: '{{ states('sensor.a`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it("shows no anchor for a scalar mid-typing the second half of an HA '' escape (F1)", () => {
    const doc = `value: '{{ states(''sensor.a`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  // F2 (adversarial verification of #172): isScalarQuoteClosed's own checks
  // pass for these mid-typing shapes even though the scalar isn't a real,
  // finished template — either an escape run (`''`) happens to leave a `'`
  // right at valueEnd-1, or a lone quote closes the scalar early and the
  // next character is one VALID_FOLLOWING_CHAR allows. Before the fix each
  // of these surfaced an anchor whose preview contained the raw
  // `TypeError: Cannot read properties of null (reading 'type')` text.
  it('shows no anchor for an unterminated trailing \'\'-escape run (F2a)', () => {
    const doc = `value: '{{ states(''`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor for an unterminated scalar after a completed \'\'-escaped arg (F2b)', () => {
    const doc = `value: '{{ states(''sensor.a''`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor for an unterminated scalar ending in three quotes (F2c)', () => {
    const doc = `value: '{{ states('''`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor for an unterminated scalar ending in four quotes (F2d)', () => {
    const doc = `value: '{{ states(''''`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor when a lone quote closes early before trailing whitespace (F2e)', () => {
    const doc = `value: '{{ states(' `
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor when a lone quote closes early before a comma (F2f)', () => {
    const doc = `value: '{{ states(',`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor when a lone quote closes early before a colon (F2g)', () => {
    const doc = `value: '{{ states(':`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor when a lone quote closes early before a comment (F2h)', () => {
    const doc = `value: '{{ states('#x`
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })

  it('shows no anchor when a lone quote closes early before a newline, mid-document (F2i)', () => {
    const doc = ['- type: text', "  value: '{{ states('", '  x: 0', ''].join('\n')
    const anchors = findTemplatePreviewAnchors(doc, { states: {} })
    expect(anchors).toHaveLength(0)
  })
})

// Guardrail (review of #172, F2): the fix rejects unbalanced Jinja delimiters
// on TOP OF the existing quote-closure check, so every one of these
// genuinely finished, previously-working templates must still anchor and
// preview correctly — a false "unclosed" would blank a legitimate preview,
// which is a worse regression than the leak this PR closes.
describe('template preview anchors still work for finished templates (F2 guardrail)', () => {
  const context = { states: { 'sensor.a': 'VAL' } }

  it('evaluates a template ending in a doubled-quote empty-string default', () => {
    const doc = `value: '{{ states(''sensor.a'', '''') }}'`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: 'VAL' }])
  })

  it('evaluates a template whose value ends in an escaped literal quote', () => {
    const doc = `value: '{{ "x" if true else "y" }}'''`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: "x'" }])
  })

  it('evaluates a double-quoted scalar with backslash-escaped quotes and backslashes', () => {
    const doc = 'value: "{{ states(\\"sensor.a\\") }}\\\\n"'
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: 'VAL\\n' }])
  })

  it('evaluates a template inside a flow sequence', () => {
    const doc = `data: ["{{ states('sensor.a') }}"]`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length - ']'.length, preview: 'VAL' }])
  })

  it('evaluates a template inside a flow map value', () => {
    const doc = `data: {a: '{{ states(''sensor.a'') }}'}`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length - '}'.length, preview: 'VAL' }])
  })

  it('evaluates a template used as a quoted flow map key', () => {
    const doc = `data: {'{{ states(''sensor.a'') }}': 1}`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length - ': 1}'.length, preview: 'VAL' }])
  })

  it('evaluates a template on an anchored scalar', () => {
    const doc = `value: &x '{{ states(''sensor.a'') }}'`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: 'VAL' }])
  })

  it('evaluates a template when the key/value separator is a tab', () => {
    const doc = "value:\t'{{ states(''sensor.a'') }}'"
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: 'VAL' }])
  })

  it('evaluates a template containing a literal tab character', () => {
    const doc = `value: '{{\tstates(''sensor.a'') }}'`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.length, preview: 'VAL' }])
  })

  it('evaluates a template in a CRLF-terminated document', () => {
    const doc = `value: '{{ states(''sensor.a'') }}'\r\nx: 0\r\n`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: 35, preview: 'VAL' }])
  })

  it('evaluates a template before a document-end marker', () => {
    const doc = `value: '{{ states(''sensor.a'') }}'\n...\n`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toEqual([{ pos: doc.indexOf('\n'), preview: 'VAL' }])
  })

  it('shows no anchor for a template that only appears inside a YAML comment', () => {
    const doc = `# value: '{{ states(''sensor.a'') }}'\nx: 0\n`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toHaveLength(0)
  })

  // The parser treats `{{` starting an unquoted value as a flow-mapping
  // indicator, not scalar text, so a plain (unquoted) templated scalar was
  // never supported by the AST-based extractor — unaffected by this fix,
  // locked in here so a future change doesn't silently start (or regress)
  // supporting it without a deliberate decision.
  it('shows no anchor for a plain unquoted templated scalar (unsupported, unaffected by this fix)', () => {
    const doc = `value: {{ states('sensor.a') }}\n`
    const anchors = findTemplatePreviewAnchors(doc, context)
    expect(anchors).toHaveLength(0)
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
