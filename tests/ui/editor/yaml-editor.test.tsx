/** @vitest-environment jsdom */
import { EditorView } from '@codemirror/view'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { YamlEditor } from '../../../src/ui/editor/YamlEditor'

describe('YamlEditor', () => {
  it('renders a CodeMirror editor with yaml content', () => {
    const value = `- type: text
  value: Hello
  x: 0
  y: 0
`
    render(
      <YamlEditor
        value={value}
        height="160px"
        colorScheme="dark"
        fontSizePx={13}
        onChange={() => {}}
        onCursorPositionChange={() => {}}
      />,
    )
    expect(screen.getByRole('textbox').textContent).toContain('Hello')
  })

  it('passes Simulator variables into inline template preview', () => {
    const value = `- type: icon
  fill: |-
    {{ something2 }}
- type: line
  fill: |-
    {{ 'green' if something3 == false else 'red' }}
`
    const { container } = render(
      <YamlEditor
        value={value}
        height="160px"
        colorScheme="dark"
        fontSizePx={13}
        onChange={() => {}}
        onCursorPositionChange={() => {}}
        mockContext={{
          states: {},
          variables: { something2: 'blue', something3: 'false' },
        }}
        templatePreviewEnabled
      />,
    )

    const previews = [...container.querySelectorAll('.cm-templatePreview')].map(
      (node) => node.textContent ?? '',
    )
    expect(previews).toHaveLength(2)
    expect(previews[0]).toContain('blue')
    expect(previews[1]).toContain('green')
  })

  it('stays quiescent across rerenders when no entityNames are supplied (PR #192 review)', () => {
    // Standalone passes no entityNames. A per-render `{}` default would give
    // entityEntries a fresh identity every render, dispatching a no-op
    // entity-ids compartment reconfigure into CodeMirror per keystroke.
    const value = '- type: text\n  value: Hello\n  x: 0\n  y: 0\n'
    const extraEntityIds: readonly string[] = ['sensor.pushed']
    const baseProps = {
      value,
      height: '160px',
      colorScheme: 'dark' as const,
      fontSizePx: 13,
      onChange: () => {},
      extraEntityIds,
    }
    const { container, rerender } = render(<YamlEditor {...baseProps} />)
    const editorRoot = container.querySelector('.cm-editor')
    const view = editorRoot ? EditorView.findFromDOM(editorRoot as HTMLElement) : null
    if (!view) {
      throw new Error('EditorView not found — did YamlEditor mount?')
    }

    const dispatchSpy = vi.spyOn(view, 'dispatch')
    rerender(<YamlEditor {...baseProps} />)

    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})
