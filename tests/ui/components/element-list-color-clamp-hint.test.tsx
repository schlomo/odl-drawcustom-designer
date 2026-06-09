/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ElementList } from '../../../src/ui/components/ElementList'

describe('ElementList color clamp hint', () => {
  it('highlights affected rows with the shared warning background', () => {
    render(
      <ElementList
        previewElements={[
          { type: 'text', value: 'Label', x: 0, y: 0 },
          {
            type: 'progress_bar',
            x_start: 0,
            y_start: 0,
            x_end: 100,
            y_end: 20,
            progress: 50,
            fill: 'yellow',
          },
        ]}
        selectedIndices={[]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    const progressRow = screen.getByRole('button', { name: /progress bar/i })
    const textRow = screen.getByRole('button', { name: /^text\b/i })

    expect(progressRow.className).toContain('var(--shell-warning-bg)')
    expect(progressRow.className).toContain('var(--shell-text)')
    expect(textRow.className).not.toContain('var(--shell-warning-bg)')
  })

  it('keeps selection styling when a clamped row is selected', () => {
    render(
      <ElementList
        previewElements={[
          {
            type: 'progress_bar',
            x_start: 0,
            y_start: 0,
            x_end: 100,
            y_end: 20,
            progress: 50,
            fill: 'yellow',
          },
        ]}
        selectedIndices={[0]}
        colorMode="bwr"
        onSelectElement={() => {}}
        onReorderElement={() => {}}
      />,
    )

    expect(screen.getByRole('button').className).toContain('bg-[var(--shell-accent)]')
  })
})
