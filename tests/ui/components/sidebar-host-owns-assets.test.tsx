/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { Sidebar } from '../../../src/ui/components/Sidebar'

/**
 * `hostOwnsAssets` (App.tsx wiring): a host that owns assets is threaded down
 * as absent `onUploadAsset`/`onClearAsset` — the same "conditional chrome"
 * pattern ADR-018 already uses for `actions`/`targets`/`renderPreview`. The
 * Content tab must stay visible (maintainer ruling: "like the states tab as
 * an explorer of the content used here") but reachable-nothing writes it.
 */

const CANVAS = {
  width: 384,
  height: 184,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

const ELEMENTS: DrawElement[] = [
  { type: 'dlimg', url: '/media/pohl89-480h.png', x: 0, y: 0, xsize: 10, ysize: 10 },
]

function sidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return (
    <Sidebar
      elements={ELEMENTS}
      previewElements={ELEMENTS}
      selectedIndices={[]}
      canvas={CANVAS}
      mockContext={{ states: {} }}
      hostStateCatalog={null}
      assetRevision={0}
      onSelectElement={() => {}}
      onCanvasSizeChange={() => {}}
      onColorModeChange={() => {}}
      onRotationChange={() => {}}
      onSetMockState={() => {}}
      onAddMockEntity={() => {}}
      onRemoveMockEntity={() => {}}
      variables={{}}
      onSetVariable={() => {}}
      onAddVariable={() => {}}
      onRemoveVariable={() => {}}
      onReorderElement={() => {}}
      {...overrides}
    />
  )
}

describe('Sidebar Content tab under hostOwnsAssets', () => {
  it('offers Upload when onUploadAsset/onClearAsset are supplied (unchanged default)', () => {
    render(
      sidebar({
        onUploadAsset: async () => ({ ok: true, mime: 'image/png' }),
        onClearAsset: () => {},
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Content' }))

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
  })

  it('the Content tab stays visible but offers no Upload/Clear affordance with no write callbacks', () => {
    render(sidebar())

    const contentTab = screen.getByRole('button', { name: 'Content' })
    expect(contentTab).toBeInTheDocument()
    fireEvent.click(contentTab)

    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    // The row for the payload's own image reference is still listed —
    // read-only explorer, not an empty tab.
    expect(screen.getByText('/media/pohl89-480h.png')).toBeInTheDocument()
  })
})
