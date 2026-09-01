/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A long branch name (e.g. a real dependabot-style branch) must never widen
// the header row — AGENTS.md's horizontal-scrollbar bug class, ADR-016
// single-row responsive layout. jsdom does no layout/measurement, so this
// test can't observe pixel truncation directly (a real-browser visual
// check, at 1461px/1300px viewports with this exact branch name, is
// recorded in the PR description — no overflow, clean ellipsis at 1300px).
// Instead it pins the CONTRACT that makes the CSS-only degrade possible:
// the branch name keeps its full, untruncated value in the DOM and in the
// tooltip (any clipping is text-overflow: ellipsis, never a JS/string
// truncation that would lose the value), and it is the one
// flexible/truncatable segment (plain `truncate`, never `shrink-0` — same
// pattern as the privacy-note span earlier in this row) while "PR #n"
// stays a separate, fixed-width, non-breaking span.
const { LONG_PR_NUMBER, LONG_BRANCH } = vi.hoisted(() => ({
  LONG_PR_NUMBER: 88,
  LONG_BRANCH: 'chore/deps-bump-npm-version-updates-group',
}))

vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    APP_HEADER_VERSION: '',
    APP_GIT_PR_NUMBER: LONG_PR_NUMBER,
    APP_GIT_BRANCH: LONG_BRANCH,
  }
})

import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import { githubBranchUrl } from '../../../src/core'

const STANDALONE_HOST = createStandaloneHost()

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function bootstrapForApp() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'PR preview long-branch header test',
      canvas: {
        width: 400,
        height: 300,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Hello', x: 5, y: 5 }],
      updatedAt: 1,
    },
    {},
    'session',
  )
}

describe('App header build metadata (PR preview build, long branch name)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('keeps the branch name as the flexible/truncatable segment, with the full name intact in the DOM and tooltip', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByTestId('header-meta-row')
    const branchLink = within(meta).getByTitle(`PR #${LONG_PR_NUMBER} · Branch: ${LONG_BRANCH}`)
    expect(branchLink).toHaveAttribute('href', githubBranchUrl(LONG_BRANCH, LONG_PR_NUMBER))

    // Full, untruncated branch name reaches the DOM — no JS/string
    // truncation. Any visual clipping at narrow widths is CSS-only.
    expect(branchLink).toHaveTextContent(LONG_BRANCH)

    // The branch link itself is the flexible, truncatable segment
    // (Tailwind `truncate`, never `shrink-0`) — the CSS contract that lets
    // it degrade via ellipsis instead of ever widening the header row.
    expect(branchLink.className).toMatch(/\btruncate\b/)
    expect(branchLink.className).not.toMatch(/\bshrink-0\b/)

    // "PR #n" is a separate, fixed-width span — never the part that
    // shrinks, and never merged into the same element as the branch name.
    const prNumberNode = within(meta).getByText(`PR #${LONG_PR_NUMBER}`)
    expect(prNumberNode.className).toMatch(/\bshrink-0\b/)
    expect(prNumberNode).not.toBe(branchLink)

    // The row container itself must not force width beyond its parent —
    // min-w-0 is what lets its flex children shrink at all.
    expect(meta.className).toMatch(/\bmin-w-0\b/)
  })
})
