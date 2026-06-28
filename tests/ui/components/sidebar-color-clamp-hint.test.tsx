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

    const hint = screen.getByRole('status', {
      name: /color mode doesn't support all colors used/i,
    })
    expect(hint.className).toContain('var(--shell-warning-bg)')
    expect(hint.textContent).not.toMatch(/yellow|grey|preview|element|#/i)
  })

  it('hides the warning when colors are printable on the tag', () => {
    renderSidebarWithElements([{ type: 'circle', x: 0, y: 0, radius: 5, fill: 'red' }])

    expect(
      screen.queryByRole('status', { name: /color mode doesn't support all colors used/i }),
    ).toBeNull()
  })
})
