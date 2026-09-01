/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PR-preview build metadata must stay unchanged in kind (no version label,
// ever) but the PR number and branch name must now be RENDERED TEXT, not
// tooltip-only (maintainer ruling 2026-08-31 on the PR #173 preview: the
// old label ran formatGitBranchLabel's fixed 12-char leaf truncation,
// which showed an unreadable "site-releas…" stub with the PR number
// visible only on hover). Mock a real (non-dev/test) PR number and branch,
// distinct from Vitest's own 'test' placeholders, so this test cannot pass
// merely because Vitest's defaults happen to look unlabeled (same
// rationale as app-header-revision-tooltip.test.tsx).
const { PR_NUMBER, PR_BRANCH } = vi.hoisted(() => ({
  PR_NUMBER: 42,
  PR_BRANCH: 'feat/some-branch',
}))

vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    // HeaderMetaRow reads the already-resolved `APP_HEADER_VERSION`
    // (src/core/buildInfo.ts's `resolveHeaderVersion`), not
    // `APP_SITE_VERSION` directly — see app-header-production-version.test.tsx.
    APP_HEADER_VERSION: '',
    APP_GIT_PR_NUMBER: PR_NUMBER,
    APP_GIT_BRANCH: PR_BRANCH,
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
      name: 'PR preview header test',
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

describe('App header build metadata (PR preview build)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('renders the PR number and the full branch name as visible text (not tooltip-only), and no version label', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByTestId('header-meta-row')

    // The PR number is its own visible text node, not buried in a title
    // attribute — getByText only matches rendered text content.
    expect(within(meta).getByText(`PR #${PR_NUMBER}`)).toBeInTheDocument()

    // The full, untruncated branch name is visible text too — this is the
    // exact regression the old formatGitBranchLabel(12-char leaf) label
    // caused ("site-releas…" instead of the real branch).
    expect(within(meta).getByText(PR_BRANCH)).toBeInTheDocument()

    // "PR #n" and the branch name are FLAT siblings (a plain span plus
    // the branch link) — not one nested inside the other — so the link's
    // own text content is just the branch name.
    const branchLink = within(meta).getByTitle(`PR #${PR_NUMBER} · Branch: ${PR_BRANCH}`)
    expect(branchLink).toHaveAttribute('href', githubBranchUrl(PR_BRANCH, PR_NUMBER))
    expect(branchLink).toHaveTextContent(PR_BRANCH)

    // No "v<version>"-shaped link anywhere in the meta row.
    const links = within(meta).getAllByRole('link')
    expect(links.some((link) => /^v\d/.test(link.textContent ?? ''))).toBe(false)
  })
})
