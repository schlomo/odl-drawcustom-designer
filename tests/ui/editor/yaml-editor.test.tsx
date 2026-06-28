/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
