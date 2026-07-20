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

  /**
   * Shadow DOM (issue #21): a window-level keydown listener sees the event
   * retargeted to the shadow *host* — `event.target` no longer reveals the
   * input the user is typing into. The real target must come from
   * `composedPath()`, or Backspace in a form field deletes canvas elements.
   * The decision is evaluated inside the listener, exactly like the real
   * DesignerCanvas handler (composedPath is only populated during dispatch).
   */
  function decideDuringWindowKeydown(target: HTMLElement, scopeRoot?: Node): boolean {
    let decision: boolean | null = null
    const listener = (event: Event) => {
      decision = shouldHandleCanvasKeyboard(event as KeyboardEvent, scopeRoot)
    }
    window.addEventListener('keydown', listener)
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, composed: true }),
    )
    window.removeEventListener('keydown', listener)
    expect(decision).not.toBeNull()
    return decision!
  }

  it('ignores shortcuts while typing in a form field inside a shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const input = shadow.appendChild(document.createElement('input'))

    // Retargeting hides the input at the window level; composedPath must win.
    let retargetedTo: EventTarget | null = null
    window.addEventListener(
      'keydown',
      (event) => {
        retargetedTo = event.target
      },
      { once: true },
    )
    expect(decideDuringWindowKeydown(input)).toBe(false)
    expect(retargetedTo).toBe(host)

    host.remove()
  })

  it('ignores shortcuts while the YAML editor inside a shadow root is focused', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const editor = shadow.appendChild(document.createElement('div'))
    editor.className = 'cm-editor'
    const content = editor.appendChild(document.createElement('div'))

    expect(decideDuringWindowKeydown(content)).toBe(false)

    host.remove()
  })

  it('allows shortcuts from the canvas surface inside a shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const canvas = shadow.appendChild(document.createElement('div'))

    expect(decideDuringWindowKeydown(canvas)).toBe(true)

    host.remove()
  })

  /**
   * Per-instance scoping (issue #21): an embedded designer must only react to
   * keystrokes originating inside its own root — host-page keystrokes must
   * not delete elements, and two instances must not both handle one event.
   */
  it('ignores events that did not travel through the given scope root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const outside = document.body.appendChild(document.createElement('div'))

    expect(decideDuringWindowKeydown(outside, shadow)).toBe(false)

    host.remove()
    outside.remove()
  })

  it('allows events from inside the given scope root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const canvas = shadow.appendChild(document.createElement('div'))

    expect(decideDuringWindowKeydown(canvas, shadow)).toBe(true)

    host.remove()
  })

  it('treats the document as an always-matching scope root (standalone)', () => {
    const canvas = document.body.appendChild(document.createElement('div'))

    expect(decideDuringWindowKeydown(canvas, document)).toBe(true)

    canvas.remove()
  })
})
