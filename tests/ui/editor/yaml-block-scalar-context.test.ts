/** @vitest-environment jsdom */
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { isAtLoneOpenBrace, isInTemplateCapableYamlValue } from '../../../src/ui/editor/jinjaContext'
import { haJinjaCompletionSource } from '../../../src/ui/editor/jinjaCompletions'
import { findYamlBlockScalarRegions } from '../../../src/ui/editor/yamlBlockScalarContext'
import { findTemplatePreviewAnchors } from '../../../src/ui/editor/templatePreviewAnchors'
import { createYamlEditorState } from '../../../src/ui/editor/yamlEditorExtensions'
import { yamlSchemaCompletionSource } from '../../../src/ui/editor/yamlCompletionSource'

function mountEditor(yaml: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const view = new EditorView({
    state: createYamlEditorState(
      yaml,
      'dark',
      13,
      () => {},
      () => {},
      undefined,
      undefined,
      [],
    ),
    parent: container,
  })
  return { view, container }
}

describe('findYamlBlockScalarRegions', () => {
  it('parses folded and literal block scalar values', () => {
    const doc = `- type: text
  value: |-
    {{ now().strftime('%H:%M') }}
  note: >-
    line one
    line two
`
    const regions = findYamlBlockScalarRegions(doc)
    expect(regions).toEqual([
      expect.objectContaining({
        key: 'value',
        value: "{{ now().strftime('%H:%M') }}",
      }),
      expect.objectContaining({
        key: 'note',
        value: 'line one line two',
      }),
    ])
  })
})

describe('block scalar editor integration', () => {
  it('does not offer yaml property completions inside block scalar content', () => {
    const doc = `- type: text
  value: |-
    an
  anchor: rt
`
    const { view, container } = mountEditor(doc)
    const pos = doc.indexOf('an') + 1
    const context = new CompletionContext(view.state, pos, true)
    expect(yamlSchemaCompletionSource(context)).toBeNull()
    view.destroy()
    container.remove()
  })

  it('offers jinja delimiter completions after a lone brace in block scalars', () => {
    const doc = `- type: text
  value: |-
    {
  x: 0
`
    const { view, container } = mountEditor(doc)
    const pos = doc.indexOf('{') + 1
    expect(isInTemplateCapableYamlValue(new CompletionContext(view.state, pos, true))).toBe(true)
    expect(isAtLoneOpenBrace(new CompletionContext(view.state, pos, true))).toBe(true)

    const result = haJinjaCompletionSource([])(new CompletionContext(view.state, pos, true))
    expect(result?.options.map((option) => option.label)).toEqual(['{{', '{%'])

    view.destroy()
    container.remove()
  })

  it('shows template preview for block scalar values', () => {
    const doc = `- type: text
  value: |-
    {{ now().strftime('%H:%M') }}
  x: 0
`
    const anchors = findTemplatePreviewAnchors(doc, {
      states: {},
      now: new Date(2026, 5, 10, 14, 30, 0),
    })
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.preview).toMatch(/14:30/)
  })
})
