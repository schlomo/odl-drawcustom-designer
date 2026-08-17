/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { YamlTemplatePreviewToggle } from '../../../src/ui/components/YamlTemplatePreviewToggle'

/**
 * Inline template-preview toggle copy (issue #107 review): the tooltip named
 * the State Simulator as the source of the previewed values. Under host-fed
 * states there *is* no Simulator — the values come from the host's own push, so
 * the copy must say that instead of pointing at a panel that does not exist.
 */

function tooltip(): string {
  return screen.getByRole('button', { name: 'Preview' }).getAttribute('title') ?? ''
}

describe('YamlTemplatePreviewToggle copy', () => {
  it('names the State Simulator while the designer owns its states', () => {
    render(<YamlTemplatePreviewToggle enabled onToggle={() => {}} />)

    expect(tooltip()).toContain('State Simulator')
  })

  it('names the host states instead when a host feeds them', () => {
    render(<YamlTemplatePreviewToggle enabled hostStatesFed onToggle={() => {}} />)

    expect(tooltip()).not.toContain('Simulator')
    expect(tooltip()).toContain('host states')
  })

  it('keeps the host wording when previews are off, too', () => {
    render(<YamlTemplatePreviewToggle enabled={false} hostStatesFed onToggle={() => {}} />)

    expect(tooltip()).not.toContain('Simulator')
    expect(tooltip()).toMatch(/host[- ]state/)
  })
})
