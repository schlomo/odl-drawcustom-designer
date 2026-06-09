/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExportIconButton } from '../../../src/ui/components/ExportIconButton'
import { shell } from '../../../src/ui/styles/shell'

describe('ExportIconButton', () => {
  it('shows success flash styling without neutral shell.button surface underneath', () => {
    render(
      <ExportIconButton
        actionId="copy-png"
        feedback="success"
        iconPath="M0 0"
        label="Copy PNG"
        onClick={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy PNG' })
    expect(button.className).toContain('--shell-success-bg')
    expect(button.className).not.toContain(shell.button)
  })

  it('sets the tooltip to the stable label when icon-only', () => {
    render(
      <ExportIconButton
        actionId="copy-png"
        feedback={null}
        iconPath="M0 0"
        tooltip="Copy PNG"
        onClick={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy PNG' })
    expect(button).toHaveAttribute('title', 'Copy PNG')
  })

  it('uses neutral shell styling when there is no feedback', () => {
    render(
      <ExportIconButton
        actionId="copy-png"
        feedback={null}
        iconPath="M0 0"
        label="Copy PNG"
        onClick={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: 'Copy PNG' })
    expect(button.className).toContain(shell.button)
    expect(button.className).not.toContain('--shell-success-bg')
  })
})
