/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { shouldHandleCanvasKeyboard } from '../../../src/ui/lib/canvas-keyboard'

describe('shouldHandleCanvasKeyboard', () => {
  it('ignores shortcuts while the YAML editor is focused', () => {
    const yaml = document.createElement('div')
    yaml.className = 'cm-editor'
    const content = document.createElement('div')
    content.contentEditable = 'true'
    yaml.append(content)
    document.body.append(yaml)

    expect(
      shouldHandleCanvasKeyboard({
        target: content,
      } as KeyboardEvent),
    ).toBe(false)

    yaml.remove()
  })

  it('allows shortcuts from the canvas surface', () => {
    const canvas = document.createElement('div')
    expect(
      shouldHandleCanvasKeyboard({
        target: canvas,
      } as KeyboardEvent),
    ).toBe(true)
  })
})
