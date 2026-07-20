/** @vitest-environment jsdom */
import { fireEvent, render, within, type RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ResolutionSelect } from '../../../src/ui/components/ResolutionSelect'

/**
 * Shadow DOM (issue #21): the outside-click closer listens on `document`,
 * where events from inside a shadow tree are retargeted to the shadow host.
 * A naive `contains(event.target)` check then mistakes every in-dropdown
 * interaction (e.g. grabbing the listbox scrollbar) for an outside click and
 * closes the menu. The observable contract: clicks inside the open dropdown
 * keep it open, clicks outside close it — same as in the light DOM.
 */

let cleanupHost: (() => void) | null = null

beforeEach(() => {
  ;(HTMLElement.prototype as HTMLElement & { scrollIntoView: () => void }).scrollIntoView =
    () => {}
})

afterEach(() => {
  cleanupHost?.()
  cleanupHost = null
  delete (HTMLElement.prototype as HTMLElement & { scrollIntoView?: () => void }).scrollIntoView
})

function renderInShadow(): { view: RenderResult; shadow: ShadowRoot } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')
  shadow.appendChild(container)
  const view = render(
    <ResolutionSelect
      value="296×128"
      canvasWidth={296}
      canvasHeight={128}
      onSelectValue={() => {}}
    />,
    { container },
  )
  cleanupHost = () => {
    view.unmount()
    host.remove()
  }
  return { view, shadow }
}

describe('ResolutionSelect inside a shadow root', () => {
  it('keeps the dropdown open on mousedown inside the listbox', () => {
    const { shadow } = renderInShadow()
    const queries = within(shadow as unknown as HTMLElement)

    fireEvent.click(queries.getByLabelText('Resolution'))
    const listbox = queries.getByRole('listbox', { name: 'Resolution options' })

    // A press on the listbox chrome itself (scrollbar drag, whitespace) — the
    // document-level closer must not treat it as an outside click.
    fireEvent.mouseDown(listbox, { composed: true })

    expect(
      queries.queryByRole('listbox', { name: 'Resolution options' }),
    ).not.toBeNull()
  })

  it('still closes the dropdown on mousedown outside the component', () => {
    const { shadow } = renderInShadow()
    const queries = within(shadow as unknown as HTMLElement)

    fireEvent.click(queries.getByLabelText('Resolution'))
    expect(queries.queryByRole('listbox', { name: 'Resolution options' })).not.toBeNull()

    fireEvent.mouseDown(document.body)

    expect(queries.queryByRole('listbox', { name: 'Resolution options' })).toBeNull()
  })
})
