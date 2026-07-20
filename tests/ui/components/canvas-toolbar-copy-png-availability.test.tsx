/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasHeaderToolbar } from '../../../src/ui/components/CanvasHeaderToolbar'
import { COPY_PNG_INSECURE_HINT } from '../../../src/ui/lib/export-download'

/**
 * Issue #80: clipboard availability is signalled upfront. On insecure origins
 * (plain-http LAN Home Assistant boxes — the mainstream deployment) Copy PNG
 * has no clipboard path, so the button renders warning-marked with a hint
 * from first paint. Download PNG and everything else stay untouched, and a
 * secure context shows no warning noise at all.
 */

function stubSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).isSecureContext
})

function renderToolbar(measureOnly = false) {
  return render(
    <CanvasHeaderToolbar
      showLabels
      zoomMode="fit"
      onZoomModeChange={() => {}}
      getFeedback={() => null}
      getFeedbackMessage={() => null}
      onCopyPng={() => {}}
      onDownloadPng={() => {}}
      canUndo={false}
      canRedo={false}
      onUndo={() => {}}
      onRedo={() => {}}
      showHiddenHints={false}
      onToggleShowHiddenHints={() => {}}
      snapGrid={{ enabled: false, size: 10 }}
      onToggleSnap={() => {}}
      previewDitherMode={0}
      onTogglePreviewDither={() => {}}
      measureOnly={measureOnly}
    />,
  )
}

describe('Copy PNG upfront availability signal', () => {
  it('marks Copy PNG with a warning and the Download PNG hint on an insecure origin', () => {
    stubSecureContext(false)
    renderToolbar()

    const copyPng = screen.getByRole('button', { name: 'Copy PNG' })
    expect(copyPng).toBeEnabled()
    expect(copyPng).toHaveAccessibleDescription(COPY_PNG_INSECURE_HINT)
    expect(screen.getByTestId('export-action-warning-hint')).toHaveTextContent(
      COPY_PNG_INSECURE_HINT,
    )
    expect(screen.getByTestId('export-action-warning-badge')).toBeInTheDocument()

    // Actions with a working insecure-context path get no warning noise.
    const downloadPng = screen.getByRole('button', { name: 'Download PNG' })
    expect(downloadPng).not.toHaveAccessibleDescription()
  })

  it('renders Copy PNG without any warning affordance in a secure context', () => {
    stubSecureContext(true)
    renderToolbar()

    const copyPng = screen.getByRole('button', { name: 'Copy PNG' })
    expect(copyPng).not.toHaveAccessibleDescription()
    expect(screen.queryByTestId('export-action-warning-badge')).toBeNull()
    expect(screen.queryByTestId('export-action-warning-hint')).toBeNull()
  })

  it('keeps the off-screen measure probe free of warning affordances', () => {
    stubSecureContext(false)
    renderToolbar(true)

    expect(screen.queryByTestId('export-action-warning-badge')).toBeNull()
    expect(screen.queryByTestId('export-action-warning-hint')).toBeNull()
  })
})
