/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from '../../../src/ui/components/IconButton'
import { shell } from '../../../src/ui/styles/shell'

describe('IconButton destructive variant', () => {
  it('uses the shared destructive icon surface', () => {
    render(
      <IconButton
        compact
        variant="destructive"
        iconPath="M0 0"
        tooltip="Delete selected"
        onClick={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete selected' }).className).toContain(
      shell.buttonDestructiveIcon,
    )
  })
})
