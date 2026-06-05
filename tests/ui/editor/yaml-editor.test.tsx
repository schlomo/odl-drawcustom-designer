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
})
