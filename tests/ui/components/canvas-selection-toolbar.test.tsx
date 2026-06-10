/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasSelectionToolbar } from '../../../src/ui/components/CanvasSelectionToolbar'

describe('CanvasSelectionToolbar', () => {
  it('disables align buttons when selection includes templated geometry', () => {
    render(
      <CanvasSelectionToolbar
        selectionCount={2}
        canAlign={false}
        canMoveUp
        canMoveDown
        boundsByIndex={new Map()}
        onAlign={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /align left/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /align left/i }).className).toContain('disabled:opacity-40')
    expect(screen.getByRole('button', { name: /bring to front/i })).toBeEnabled()
  })
})
