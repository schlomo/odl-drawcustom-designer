/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_GITHUB_REPO_URL,
  APP_GIT_BRANCH,
  APP_GIT_REVISION,
  APP_PRIVACY_HEADLINE,
  APP_PRIVACY_NOTE,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  githubBranchUrl,
  githubCommitUrl,
} from '../../../src/core'
import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'

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
      name: 'Header test',
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

describe('App header build metadata', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('shows privacy headline with full note as tooltip', async () => {
    render(<App bootstrap={bootstrapForApp()} />)

    await waitFor(() => {
      expect(screen.getByText(APP_PRIVACY_HEADLINE)).toBeInTheDocument()
    })

    expect(screen.getByText(APP_PRIVACY_HEADLINE)).toHaveAttribute('title', APP_PRIVACY_NOTE)
  })

  it('shows GitHub, branch, and revision links in order', async () => {
    render(<App bootstrap={bootstrapForApp()} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByText(APP_PRIVACY_HEADLINE).closest('div')
    expect(meta).not.toBeNull()

    const links = within(meta!).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'GitHub',
      formatGitBranchLabel(APP_GIT_BRANCH),
      formatGitRevisionLabel(APP_GIT_REVISION),
    ])
  })

  it('links GitHub, branch, and revision to the repository', async () => {
    render(<App bootstrap={bootstrapForApp()} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const repoLink = screen.getByRole('link', { name: 'GitHub' })
    expect(repoLink).toHaveAttribute('href', APP_GITHUB_REPO_URL)
    expect(repoLink).toHaveAttribute('target', '_blank')

    const branchLink = screen.getByTitle(`Branch: ${APP_GIT_BRANCH}`)
    expect(branchLink).toHaveAttribute('href', githubBranchUrl(APP_GIT_BRANCH))
    expect(branchLink).toHaveAttribute('target', '_blank')
    expect(branchLink).toHaveTextContent(formatGitBranchLabel(APP_GIT_BRANCH))

    const revisionLink = screen.getByTitle(`Revision: ${APP_GIT_REVISION}`)
    expect(revisionLink).toHaveAttribute('href', githubCommitUrl(APP_GIT_REVISION))
    expect(revisionLink).toHaveAttribute('target', '_blank')
  })
})
