/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusHint } from '../../../src/ui/components/StatusHint'

describe('StatusHint accessible name', () => {
  it('exposes the recovery instruction to screen readers, not just the title', () => {
    render(
      <StatusHint
        message={{
          severity: 'warning',
          title: 'Display no longer available',
          summary: 'showing its last known display config — pick another display to switch',
        }}
      />,
    )

    // role="status" is a live region: screen readers announce its rendered
    // content on update. An aria-label on the same element replaces that
    // announcement with just the label, so the recovery instruction in the
    // summary never reached the user — only the title did (issue #150).
    // role="status" takes its accessible name from aria-label/
    // aria-labelledby only, never from content, so removing the label must
    // be verified two ways: no attribute is left to hijack the
    // announcement, and the announced content itself carries the full
    // message.
    const hint = screen.getByRole('status')
    expect(hint).not.toHaveAttribute('aria-label')
    expect(hint).toHaveTextContent(/pick another display to switch/i)
  })
})
