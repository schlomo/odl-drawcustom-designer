/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextButton } from '../../../src/ui/components/TextButton'
import { shell } from '../../../src/ui/styles/shell'

describe('TextButton', () => {
  it('renders default and destructive variants from shell tokens', () => {
    const { rerender } = render(<TextButton>Save</TextButton>)
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain(shell.button)

    rerender(
      <TextButton variant="destructive" onClick={() => {}}>
        Clear all
      </TextButton>,
    )
    expect(screen.getByRole('button', { name: 'Clear all' }).className).toContain(
      shell.buttonDestructive,
    )
  })
})
