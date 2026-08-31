/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../../src/ui/components/Sidebar'

const defaultCanvas = {
  width: 384,
  height: 184,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

function renderSidebar() {
  render(
    <Sidebar
      elements={[]}
      previewElements={[]}
      selectedIndices={[]}
      canvas={defaultCanvas}
      mockContext={{ states: {} }}
      assetRevision={0}
      onSelectElement={() => {}}
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

describe('Sidebar orientation hint', () => {
  it('renders a short, visible hint beside the Orientation heading that the canvas always draws upright', () => {
    renderSidebar()

    // Behavior-level: text must be rendered/visible in the section, not
    // merely present as a title attribute or aria-label (ADR-011).
    const heading = screen.getByText('Orientation')
    const hint = screen.getByText(/always upright/i)

    expect(hint).toBeVisible()
    // Hint sits with the Orientation control, not elsewhere in the sidebar.
    expect(heading.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Kept intentionally short (maintainer ruling): must fit beside the
    // heading without wrapping or pushing the rotation buttons down.
    expect(hint.textContent!.length).toBeLessThanOrEqual(20)
    // Accuracy ruling: do not claim any preview shows the final/true
    // rendering — that is unverified pending a separate investigation.
    expect(hint.textContent).not.toMatch(/preview|final|true result/i)
  })
})
