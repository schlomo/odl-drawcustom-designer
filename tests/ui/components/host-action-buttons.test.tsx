/** @vitest-environment jsdom */
import { mdiWeatherSunny } from '@mdi/js'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HostActionButtons } from '../../../src/ui/components/HostActionButtons'

/**
 * The disabling rules the actions seam promises hosts (issue #108,
 * docs/embedding.md): a blocked YAML document disables every action that
 * *needs* the payload — the same rule that disables Save — while a
 * `needsPayload: false` action stays clickable, and a host's own
 * `disabledReason` outranks the designer's message, being the more specific
 * statement about its own button.
 */

function tooltipFor(name: string): HTMLElement | null {
  const wrapper = screen.getByRole('button', { name }).parentElement!
  return wrapper.querySelector('[role="tooltip"]')
}

function requireTooltipFor(name: string): HTMLElement {
  const tooltip = tooltipFor(name)
  if (tooltip == null) {
    throw new Error(`no tooltip rendered for ${name}`)
  }
  return tooltip
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
    expect(requireTooltipFor('Validate')).toHaveTextContent(
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

    expect(requireTooltipFor('Send to display')).toHaveTextContent('Display offline')
  })

  it('leaves a needsPayload:false action clickable while the YAML is blocked', () => {
    const onAction = vi.fn()
    render(
      <HostActionButtons
        actions={[
          { id: 'send', label: 'Send to display' },
          { id: 'settings', label: 'Display settings', needsPayload: false },
        ]}
        designerDisabledReason="Fix the YAML errors before running this action"
        onAction={onAction}
      />,
    )

    // Both directions: the payload-carrying action is blocked, the one that
    // does not read the payload is not.
    expect(screen.getByRole('button', { name: 'Send to display' })).toBeDisabled()
    const settings = screen.getByRole('button', { name: 'Display settings' })
    expect(settings).toBeEnabled()
    expect(tooltipFor('Display settings')).toBeNull()

    fireEvent.click(settings)
    expect(onAction).toHaveBeenCalledExactlyOnceWith('settings')
  })

  it("still honours a host's own disabledReason on a needsPayload:false action", () => {
    render(
      <HostActionButtons
        actions={[
          {
            id: 'settings',
            label: 'Display settings',
            needsPayload: false,
            disabledReason: 'Display offline',
          },
        ]}
        designerDisabledReason="Fix the YAML errors before running this action"
        onAction={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Display settings' })).toBeDisabled()
    expect(requireTooltipFor('Display settings')).toHaveTextContent('Display offline')
  })

  it('keeps the button element (and its keyboard focus) across a disabledReason re-push', () => {
    // A re-push that only adds a reason must not swap the rendered element
    // type — that remounts the button, dropping focus and any assistive-tech
    // state pointing at it. Same DOM node before and after is the observable
    // form of "no remount".
    const actions = (reason?: string) => [
      { id: 'send', label: 'Send to display', disabledReason: reason },
    ]
    const { rerender } = render(
      <HostActionButtons actions={actions()} onAction={() => {}} />,
    )

    const before = screen.getByRole('button', { name: 'Send to display' })
    before.focus()
    expect(document.activeElement).toBe(before)

    rerender(<HostActionButtons actions={actions('Display offline')} onAction={() => {}} />)

    const after = screen.getByRole('button', { name: 'Send to display' })
    expect(after).toBe(before)
    expect(document.activeElement).toBe(before)

    // …and back again, the direction a host takes when it reconnects.
    rerender(<HostActionButtons actions={actions()} onAction={() => {}} />)
    expect(screen.getByRole('button', { name: 'Send to display' })).toBe(before)
  })

  it('describes a disabled action to assistive tech, not only on hover', () => {
    render(
      <HostActionButtons
        actions={[{ id: 'send', label: 'Send to display', disabledReason: 'Display offline' }]}
        onAction={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: 'Send to display' })
    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Display offline')
  })

  it('draws an arbitrary Material Design icon name, mdi: prefix and all', () => {
    render(
      <HostActionButtons
        actions={[{ id: 'weather', label: 'Weather', icon: 'mdi:weather-sunny' }]}
        onAction={() => {}}
      />,
    )

    const path = screen
      .getByRole('button', { name: 'Weather' })
      .querySelector('svg path')
      ?.getAttribute('d')
    expect(path).toBeTruthy()
    // mdiWeatherSunny's path data, not some placeholder.
    expect(path).toBe(mdiWeatherSunny)
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
