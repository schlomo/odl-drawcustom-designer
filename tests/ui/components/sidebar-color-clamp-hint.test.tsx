/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../../src/ui/components/Sidebar'

const defaultCanvas = {
  width: 800,
  height: 480,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

function renderSidebarWithElements(
  previewElements: Parameters<typeof Sidebar>[0]['previewElements'],
  canvas = defaultCanvas,
) {
  render(
    <Sidebar
      elements={previewElements}
      previewElements={previewElements}
      selectedIndices={[]}
      canvas={canvas}
      mockContext={{ states: {} }}
      assetRevision={0}
      onSelectElement={() => {}}
      onApplyResolution={() => {}}
      onCanvasSizeChange={() => {}}
      onColorModeChange={vi.fn()}
      onRotationChange={() => {}}
      onSetMockState={() => {}}
      onAddMockEntity={() => {}}
      onRemoveMockEntity={() => {}}
      variables={{}}
      onSetVariable={() => {}}
      onAddVariable={() => {}}
      onRemoveVariable={() => {}}
      onUploadAsset={async () => ({ ok: true, mime: 'image/png' })}
      onClearAsset={() => {}}
      onReorderElement={() => {}}
    />,
  )
}

describe('Sidebar color clamp hint', () => {
  it('shows a warning under color mode when elements lose color information', () => {
    renderSidebarWithElements([
      {
        type: 'progress_bar',
        x_start: 0,
        y_start: 0,
        x_end: 100,
        y_end: 20,
        progress: 50,
        fill: 'yellow',
      },
    ])

    // role="status" takes its accessible name from aria-label/aria-labelledby
    // only (issue #150) — it never derives one from content, so the hint is
    // located by its live-region text instead of an RTL accessible name.
    const hintText = screen.getByText(/color mode doesn't support all colors used/i)
    const hint = hintText.closest('[role="status"]')
    expect(hint).not.toBeNull()
    expect(hint!.className).toContain('var(--shell-warning-bg)')
    expect(hint!.textContent).not.toMatch(/yellow|grey|preview|element|#/i)
  })

  it('hides the warning when colors are printable on the tag', () => {
    renderSidebarWithElements([{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'red' }])

    expect(screen.queryByText(/color mode doesn't support all colors used/i)).toBeNull()
  })
})
