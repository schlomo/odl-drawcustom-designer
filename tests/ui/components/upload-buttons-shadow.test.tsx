/** @vitest-environment jsdom */
import { fireEvent, render, within, type RenderResult } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ContentManager } from '../../../src/ui/components/ContentManager'
import { ElementPropertyForm } from '../../../src/ui/components/ElementPropertyForm'

/**
 * Shadow DOM (issue #21): the Upload buttons forward the click to their
 * hidden file input by element id. Inside a shadow root the input is not
 * reachable via `document.getElementById` — the lookup must happen in the
 * button's own root, or the file picker silently never opens.
 */

let cleanupHost: (() => void) | null = null

afterEach(() => {
  cleanupHost?.()
  cleanupHost = null
})

function renderInShadow(ui: Parameters<typeof render>[0]): {
  view: RenderResult
  shadow: ShadowRoot
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')
  shadow.appendChild(container)
  const view = render(ui, { container })
  cleanupHost = () => {
    view.unmount()
    host.remove()
  }
  return { view, shadow }
}

describe('upload buttons inside a shadow root', () => {
  it('Content Manager Upload opens the file picker for its hidden input', () => {
    const elements: DrawElement[] = [
      { type: 'dlimg', url: '/media/photo.png', x: 0, y: 0, xsize: 10, ysize: 10 },
    ]
    const { shadow } = renderInShadow(
      <ContentManager
        elements={elements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        onUpload={async () => ({ ok: true, mime: 'image/png' })}
        onClear={() => {}}
      />,
    )
    const queries = within(shadow as unknown as HTMLElement)

    const input = shadow.getElementById('content-upload-%2Fmedia%2Fphoto.png')
    expect(input).not.toBeNull()
    const picker = vi.fn()
    input!.addEventListener('click', picker)

    fireEvent.click(queries.getByRole('button', { name: 'Upload' }))

    expect(picker).toHaveBeenCalledTimes(1)
  })

  it('property panel image Upload opens the file picker for its hidden input', () => {
    const element: DrawElement = {
      type: 'dlimg',
      url: '/media/photo.png',
      x: 0,
      y: 0,
      xsize: 10,
      ysize: 10,
    }
    const { shadow } = renderInShadow(
      <ElementPropertyForm
        element={element}
        fontKeys={[]}
        onPropertyChange={() => {}}
        onUploadFont={async () => ({ ok: true, mime: 'font/ttf' })}
        onUploadImageForUrl={async () => ({ ok: true, mime: 'image/png' })}
        properties={['url']}
      />,
    )
    const queries = within(shadow as unknown as HTMLElement)

    const input = shadow.getElementById('image-upload-url')
    expect(input).not.toBeNull()
    const picker = vi.fn()
    input!.addEventListener('click', picker)

    fireEvent.click(queries.getByRole('button', { name: 'Upload' }))

    expect(picker).toHaveBeenCalledTimes(1)
  })
})
