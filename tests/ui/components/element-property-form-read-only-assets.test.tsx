/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ElementPropertyForm } from '../../../src/ui/components/ElementPropertyForm'

/**
 * When the host owns assets, App.tsx passes no `onUploadFont`/
 * `onUploadImageForUrl` (the same "conditional chrome, presence gates it"
 * pattern ADR-018 uses for `actions`/`targets`/`renderPreview`). Every
 * upload affordance the property panel offers for font and image-URL fields
 * must then be entirely absent, not merely disabled — a select option that
 * still opens a file picker, or a button still in the tab order, is still a
 * reachable write path into a store the host is not reading.
 */

const textElement: DrawElement = { type: 'text', value: 'Hello', x: 5, y: 5, font: 'ppb.ttf' }
const imageElement: DrawElement = {
  type: 'dlimg',
  url: '/local/logo.png',
  x: 0,
  y: 0,
  xsize: 10,
  ysize: 10,
}

describe('ElementPropertyForm — no upload affordances when the host owns assets', () => {
  it('the font field offers "Upload font…" and a file input when onUploadFont is supplied (unchanged default)', () => {
    render(
      <ElementPropertyForm
        element={textElement}
        fontKeys={['ppb.ttf', 'rbm.ttf']}
        onPropertyChange={() => {}}
        onUploadFont={vi.fn()}
        onUploadImageForUrl={vi.fn()}
        properties={['font']}
      />,
    )

    expect(screen.getByRole('option', { name: 'Upload font…' })).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('the font field has no "Upload font…" option and no file input when onUploadFont is absent', () => {
    render(
      <ElementPropertyForm
        element={textElement}
        fontKeys={['ppb.ttf', 'rbm.ttf']}
        onPropertyChange={() => {}}
        properties={['font']}
      />,
    )

    expect(screen.queryByRole('option', { name: 'Upload font…' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('the image URL field offers an Upload button when onUploadImageForUrl is supplied (unchanged default)', () => {
    render(
      <ElementPropertyForm
        element={imageElement}
        fontKeys={[]}
        onPropertyChange={() => {}}
        onUploadFont={vi.fn()}
        onUploadImageForUrl={vi.fn()}
        properties={['url']}
      />,
    )

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('the image URL field has no Upload button and no file input when onUploadImageForUrl is absent', () => {
    render(
      <ElementPropertyForm
        element={imageElement}
        fontKeys={[]}
        onPropertyChange={() => {}}
        properties={['url']}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
