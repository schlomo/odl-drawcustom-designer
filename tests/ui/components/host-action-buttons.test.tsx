/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HostActionButtons } from '../../../src/ui/components/HostActionButtons'

/**
 * The two disabling rules the actions seam promises hosts (issue #108,
 * docs/embedding.md): a blocked YAML document disables every action — the
 * same rule that disables Save, since an action carries the payload — and a
 * host's own `disabledReason` outranks that message, being the more specific
 * statement about its own button.
 */

function tooltipFor(name: string): HTMLElement {
  const wrapper = screen.getByRole('button', { name }).parentElement!
  return wrapper.querySelector('[role="tooltip"]') as HTMLElement
}

describe('HostActionButtons', () => {
  it('disables every action while the designer itself is blocked', () => {
    const onAction = vi.fn()
    render(
      <HostActionButtons
        actions={[
          { id: 'send', label: 'Send to display', severity: 'caution' },
          { id: 'validate', label: 'Validate' },
        ]}
        designerDisabledReason="Fix the YAML errors before running this action"
        onAction={onAction}
      />,
    )

    expect(screen.getByRole('button', { name: 'Send to display' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()
    expect(tooltipFor('Validate')).toHaveTextContent(
      'Fix the YAML errors before running this action',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    expect(onAction).not.toHaveBeenCalled()
  })

  it("states the host's own reason in preference to the designer's", () => {
    render(
      <HostActionButtons
        actions={[{ id: 'send', label: 'Send to display', disabledReason: 'Display offline' }]}
        designerDisabledReason="Fix the YAML errors before running this action"
        onAction={() => {}}
      />,
    )

    expect(tooltipFor('Send to display')).toHaveTextContent('Display offline')
  })

  it('runs an enabled action with its own id', () => {
    const onAction = vi.fn()
    render(
      <HostActionButtons
        actions={[
          { id: 'send', label: 'Send to display' },
          { id: 'validate', label: 'Validate' },
        ]}
        onAction={onAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    expect(onAction).toHaveBeenCalledExactlyOnceWith('validate')
  })
})
