/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PR-preview build metadata must stay unchanged: no version label, ever —
// only branch + SHA (+ "PR #n" in the tooltip). Mock a real (non-dev/test)
// PR number and branch, distinct from Vitest's own 'test' placeholders, so
// this test cannot pass merely because Vitest's defaults happen to look
// unlabeled (same rationale as app-header-revision-tooltip.test.tsx).
const { PR_NUMBER, PR_BRANCH } = vi.hoisted(() => ({
  PR_NUMBER: 42,
  PR_BRANCH: 'feat/some-branch',
}))

vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    APP_SITE_VERSION: '',
    APP_GIT_PR_NUMBER: PR_NUMBER,
    APP_GIT_BRANCH: PR_BRANCH,
  }
})

import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import { formatGitBranchLabel, githubBranchUrl } from '../../../src/core'

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

  it('shows the branch link titled with the PR number, and no version label', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByTestId('header-meta-row')

    const branchLink = within(meta).getByTitle(`PR #${PR_NUMBER} · Branch: ${PR_BRANCH}`)
    expect(branchLink).toHaveAttribute('href', githubBranchUrl(PR_BRANCH, PR_NUMBER))
    expect(branchLink).toHaveTextContent(formatGitBranchLabel(PR_BRANCH))

    // No "v<version>"-shaped link anywhere in the meta row.
    const links = within(meta).getAllByRole('link')
    expect(links.some((link) => /^v\d/.test(link.textContent ?? ''))).toBe(false)
  })
})
