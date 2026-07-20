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

  it('surfaces the error message as a visible alert next to the failed button (issue #76)', () => {
    render(
      <ExportIconButton
        actionId="copy-png"
        feedback="error"
        feedbackMessage="Clipboard requires HTTPS or localhost"
        iconPath="M0 0"
        label="Copy PNG"
        onClick={() => {}}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Clipboard requires HTTPS or localhost')
  })

  it('shows no alert when the flash succeeded or no message is attached', () => {
    render(
      <ExportIconButton
        actionId="copy-png"
        feedback="success"
        feedbackMessage={null}
        iconPath="M0 0"
        label="Copy PNG"
        onClick={() => {}}
      />,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })

  describe('upfront availability warning (issue #80)', () => {
    const hint = 'Copy PNG needs HTTPS or localhost — use Download PNG instead'

    it('renders warning-marked but still enabled, with the hint as accessible description', () => {
      render(
        <ExportIconButton
          actionId="copy-png"
          feedback={null}
          warning={hint}
          iconPath="M0 0"
          label="Copy PNG"
          onClick={() => {}}
        />,
      )

      const button = screen.getByRole('button', { name: 'Copy PNG' })
      // Warning-marked, not disabled: click still reaches the post-click alert backstop.
      expect(button).toBeEnabled()
      expect(button.className).toContain('--shell-warning')
      expect(button.className).not.toContain(shell.button)
      expect(button).toHaveAccessibleDescription(hint)
      expect(screen.getByTestId('export-action-warning-badge')).toBeInTheDocument()
      expect(screen.getByTestId('export-action-warning-hint')).toHaveTextContent(hint)
    })

    it('renders no warning affordance when the action is available', () => {
      render(
        <ExportIconButton
          actionId="copy-png"
          feedback={null}
          warning={null}
          iconPath="M0 0"
          label="Copy PNG"
          onClick={() => {}}
        />,
      )

      const button = screen.getByRole('button', { name: 'Copy PNG' })
      expect(button.className).toContain(shell.button)
      expect(screen.queryByTestId('export-action-warning-badge')).toBeNull()
      expect(screen.queryByTestId('export-action-warning-hint')).toBeNull()
    })

    it('lets the post-click error alert win over the standing warning while flashing', () => {
      render(
        <ExportIconButton
          actionId="copy-png"
          feedback="error"
          feedbackMessage="Clipboard requires HTTPS or localhost"
          warning={hint}
          iconPath="M0 0"
          label="Copy PNG"
          onClick={() => {}}
        />,
      )

      const button = screen.getByRole('button', { name: 'Copy PNG' })
      expect(button.className).toContain('--shell-danger')
      expect(screen.getByRole('alert')).toHaveTextContent('Clipboard requires HTTPS or localhost')
    })
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
