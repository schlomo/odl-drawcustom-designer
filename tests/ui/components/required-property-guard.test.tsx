/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ElementPropertyForm } from '../../../src/ui/components/ElementPropertyForm'
import {
  defaultMultilineOffsetY,
  normalizePropertyValueForStorage,
  serializeYamlPayload,
  validatePayload,
} from '../../../src/core'

/**
 * Maintainer report (2026-09-01): "When I empty out offset_y in the properties
 * or set it to the internal default then it disappears from YAML and the
 * editor goes into bad YAML mode… same when I empty out x."
 *
 * Two separate defects, both ending in the same place — a required key missing
 * from the payload, schema validation failing, and the canvas stuck on "YAML
 * not applied to canvas".
 *
 * A. Clearing a required field committed `undefined`, which deletes the key.
 * B. Setting a required field to exactly its default omitted it, because the
 *    omit-if-equal-to-default rule did not distinguish required from optional.
 *
 * Asserted at the level the user experiences: what ends up in the payload and
 * whether it still validates.
 */

const noopUpload = async () => ({ ok: true as const, mime: 'font/ttf' })

function multiline(overrides: Record<string, unknown> = {}) {
  return {
    type: 'multiline' as const,
    value: 'Line 1|Line 2',
    delimiter: '|',
    x: 80,
    offset_y: 26,
    size: 20,
    ...overrides,
  }
}

function renderForm(
  element: Parameters<typeof ElementPropertyForm>[0]['element'],
  properties: string[],
  onPropertyChange: (property: string, value: unknown) => void,
) {
  render(
    <ElementPropertyForm
      element={element}
      fontKeys={[]}
      onPropertyChange={onPropertyChange}
      onUploadFont={noopUpload}
      onUploadImageForUrl={noopUpload}
      properties={properties}
    />,
  )
}

/** Apply what the form committed, the way the app's update path does. */
function applyCommit(
  element: Record<string, unknown>,
  property: string,
  value: unknown,
): Record<string, unknown> {
  const next = { ...element }
  if (value === undefined) {
    delete next[property]
  } else {
    next[property] = value
  }
  return next
}

describe('Bug A — the property editor refuses to empty a required field', () => {
  it('does not drop `offset_y` when it is cleared', () => {
    const onPropertyChange = vi.fn()
    renderForm(multiline(), ['offset_y'], onPropertyChange)

    const input = screen.getByTestId('property-input-offset_y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    const cleared = onPropertyChange.mock.calls.filter(([, value]) => value === undefined)
    expect(cleared).toEqual([])
  })

  it('does not drop `x` when it is cleared', () => {
    const onPropertyChange = vi.fn()
    renderForm(multiline(), ['x'], onPropertyChange)

    const input = screen.getByTestId('property-input-x')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(onPropertyChange.mock.calls.filter(([, value]) => value === undefined)).toEqual([])
  })

  it('leaves the payload valid and the value unchanged after a clear attempt', () => {
    let element: Record<string, unknown> = multiline()
    renderForm(element as never, ['offset_y'], (property, value) => {
      element = applyCommit(element, property, value)
    })

    const input = screen.getByTestId('property-input-offset_y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(element.offset_y).toBe(26)
    expect(validatePayload([element]).success).toBe(true)
  })

  it('says why nothing changed, without a modal', () => {
    renderForm(multiline(), ['offset_y'], vi.fn())

    const input = screen.getByTestId('property-input-offset_y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(screen.getByRole('status')).toHaveTextContent(/required/i)
  })

  it('still lets the user select all and retype a new value', () => {
    let element: Record<string, unknown> = multiline()
    renderForm(element as never, ['offset_y'], (property, value) => {
      element = applyCommit(element, property, value)
    })

    const input = screen.getByTestId('property-input-offset_y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)

    expect(element.offset_y).toBe(40)
    expect(validatePayload([element]).success).toBe(true)
  })

  it('still removes an OPTIONAL field when it is cleared', () => {
    let element: Record<string, unknown> = multiline({ y: 30 })
    renderForm(element as never, ['y'], (property, value) => {
      element = applyCommit(element, property, value)
    })

    const input = screen.getByTestId('property-input-y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect('y' in element).toBe(false)
    expect(validatePayload([element]).success).toBe(true)
  })
})

describe('Bug B — a required field set to its default is still written', () => {
  it('keeps `offset_y` when it equals the computed default for its size', () => {
    // The maintainer's exact case: size 20 -> default 26.
    const element = multiline({ size: 20 })
    expect(defaultMultilineOffsetY(20)).toBe(26)

    const stored = normalizePropertyValueForStorage(element, 'offset_y', 26)

    expect(stored).toBe(26)
  })

  it('keeps the key in the serialized YAML and the payload valid', () => {
    let element: Record<string, unknown> = multiline({ size: 20, offset_y: 40 })
    renderForm(element as never, ['offset_y'], (property, value) => {
      element = applyCommit(element, property, value)
    })

    const input = screen.getByTestId('property-input-offset_y')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '26' } })
    fireEvent.blur(input)

    expect(element.offset_y).toBe(26)
    expect(serializeYamlPayload([element] as never)).toContain('offset_y: 26')
    expect(validatePayload([element]).success).toBe(true)
  })

  it('round-trips a required-equals-default payload without losing the key', () => {
    const element = multiline({ size: 20, offset_y: 26 })
    const yaml = serializeYamlPayload([element] as never)

    expect(yaml).toContain('offset_y: 26')
    expect(validatePayload([element]).success).toBe(true)
  })

  it('applies to every required field with a default, not just multiline', () => {
    // circle.radius and arc.radius are required AND carry a static default —
    // the same trap, pre-dating the multiline one.
    const circle = { type: 'circle' as const, x: 10, y: 10, radius: 20 }
    const arc = {
      type: 'arc' as const,
      x: 10,
      y: 10,
      radius: 20,
      start_angle: 0,
      end_angle: 90,
    }

    expect(normalizePropertyValueForStorage(circle, 'radius', 20)).toBe(20)
    expect(normalizePropertyValueForStorage(arc, 'radius', 20)).toBe(20)
  })

  it('still omits an OPTIONAL field that equals its default', () => {
    const element = multiline()

    expect(normalizePropertyValueForStorage(element, 'size', 20)).toBeUndefined()
  })
})
