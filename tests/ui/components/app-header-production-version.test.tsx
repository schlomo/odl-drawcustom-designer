/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Production build metadata (APP_SITE_VERSION set only by the `production`
// job in .github/workflows/pages.yml, docs/releasing.md#site-version).
// Under Vitest APP_SITE_VERSION is always '' (build-time short-circuit,
// AGENTS.md "Build-time defines"), so mock the src/core barrel to simulate
// a production-shaped build — same technique as
// app-header-revision-tooltip.test.tsx.
const { SITE_VERSION } = vi.hoisted(() => ({ SITE_VERSION: '3.0.0' }))

vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    APP_SITE_VERSION: SITE_VERSION,
  }
})

import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import { APP_GIT_REVISION, formatGitRevisionLabel, githubReleaseUrl } from '../../../src/core'

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
      name: 'Production header test',
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

describe('App header build metadata (production build)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('shows GitHub, the release version, and the SHA in order — no branch link', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByTestId('header-meta-row')
    const links = within(meta).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'GitHub',
      `v${SITE_VERSION}`,
      formatGitRevisionLabel(APP_GIT_REVISION),
    ])
  })

  it('links the version to the GitHub release page, titled for build honesty', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const versionLink = screen.getByRole('link', { name: `v${SITE_VERSION}` })
    expect(versionLink).toHaveAttribute('href', githubReleaseUrl(SITE_VERSION))
    expect(versionLink).toHaveAttribute('title', `Release v${SITE_VERSION}`)
    expect(versionLink).toHaveAttribute('target', '_blank')
  })

  it('still keeps the commit SHA link for traceability alongside the version', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const revisionLink = screen.getByRole('link', {
      name: formatGitRevisionLabel(APP_GIT_REVISION),
    })
    expect(revisionLink).toBeInTheDocument()
  })
})
