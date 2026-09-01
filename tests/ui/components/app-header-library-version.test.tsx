/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Library-shaped build metadata: a build vendored into a host (e.g. the HA
// panel embed). The release pipeline bakes a real, released `APP_VERSION`
// into every build of a release run (tools/releaseVersion.ts →
// tools/createRelease.ts), and there is no PR context here.
// `resolveHeaderVersion` (src/core/buildInfo.ts) is what turns that into a
// real `APP_HEADER_VERSION` — unit-tested directly in
// tests/core/buildInfo.test.ts; this test only proves HeaderMetaRow renders
// what `APP_HEADER_VERSION` resolves to, the same way
// app-header-production-version.test.tsx and
// app-header-pr-preview-version.test.tsx mock it. The bug this guards
// against: an embedded designer showing a SHA even though it knows its own
// release version.
const { APP_VERSION } = vi.hoisted(() => ({ APP_VERSION: '3.3.0' }))

vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    APP_HEADER_VERSION: APP_VERSION,
    APP_GIT_PR_NUMBER: 0,
  }
})

import { App } from '../../../src/ui/App'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import { githubReleaseUrl } from '../../../src/core'

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
      name: 'Library-build header test',
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

describe('App header build metadata (library build, e.g. embedded in a host)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('shows the library release version instead of falling back to branch + SHA', async () => {
    render(<App bootstrap={bootstrapForApp()} host={STANDALONE_HOST} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    })

    const meta = screen.getByTestId('header-meta-row')
    const versionLink = within(meta).getByRole('link', { name: `v${APP_VERSION}` })
    expect(versionLink).toHaveAttribute('href', githubReleaseUrl(APP_VERSION))
  })
})
