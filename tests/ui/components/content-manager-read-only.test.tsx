/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ContentManager } from '../../../src/ui/components/ContentManager'

/**
 * `hostOwnsAssets` (read-only Content tab): with no `onUpload`/`onClear`
 * supplied — the state App.tsx puts the tab in when the host owns assets —
 * every write affordance must be entirely absent from the DOM, not merely
 * disabled. A `disabled` button is still reachable by assistive tech and
 * still a promise the click does nothing invisible; removing the element is
 * what the maintainer's "read-only explorer" ruling asks for, and it is also
 * what keeps a hidden-but-laid-out control from widening the scroller
 * (AGENTS.md, PR #85 bug class) — there is nothing to hide with `display:none`
 * because nothing is rendered.
 */

const referencedElements: DrawElement[] = [
  {
    type: 'dlimg',
    url: '/media/pohl89-480h.png',
    x: 0,
    y: 0,
    xsize: 10,
    ysize: 10,
  },
]

describe('ContentManager — read-only when the host owns assets', () => {
  it('renders Upload/Replace/Clear controls when write callbacks are supplied (unchanged default)', () => {
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        onUpload={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('renders no upload control, no file input, and no clear control when onUpload/onClear are absent', () => {
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide demo' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('the "all" scope empty state says assets come from the host, not that none are stored', () => {
    render(
      <ContentManager elements={[]} assetRevision={0} scope="all" onScopeChange={() => {}} />,
    )

    expect(screen.getByText(/host/i)).toBeInTheDocument()
    expect(screen.queryByText('No uploaded assets stored locally.')).toBeNull()
  })
})
