/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from '../../../src/ui/components/IconButton'

describe('IconButton tooltips', () => {
  it('uses tooltip as title when icon-only', () => {
    render(
      <IconButton compact iconPath="M0 0" tooltip="Align left" onClick={() => {}} />,
    )

    expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute('title', 'Align left')
  })
})
