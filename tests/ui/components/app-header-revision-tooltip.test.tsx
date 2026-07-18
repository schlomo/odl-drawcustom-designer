/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Under Vitest both baked revisions are 'test', which would make this test
// pass even if App.tsx never wires formatRevisionTooltip into the link.
// Mock DISTINCT head/merge revisions so the rendered title behaviorally
// pins the tooltip wiring (Copilot review on PR #43).
const { HEAD_REVISION, MERGE_REVISION } = vi.hoisted(() => ({
  HEAD_REVISION: 'feedbee',
  MERGE_REVISION: '895142a',
}))

// App.tsx imports build metadata from the src/core barrel, so mock the
// barrel (keeping everything else, including the real formatRevisionTooltip).
vi.mock('../../../src/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core')>()
  return {
    ...original,
    APP_GIT_REVISION: HEAD_REVISION,
    APP_GIT_MERGE_REVISION: MERGE_REVISION,
  }
})

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
      name: 'Header tooltip test',
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

describe('App header revision tooltip (PR preview build)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubMatchMedia()
  })

  it('shows the head SHA as the label and the merge SHA in the title', async () => {
    render(<App bootstrap={bootstrapForApp()} />)

    await waitFor(() => {
      expect(screen.getByText(HEAD_REVISION)).toBeInTheDocument()
    })

    const revisionLink = screen.getByText(HEAD_REVISION)
    expect(revisionLink).toHaveAttribute(
      'title',
      `Revision: ${HEAD_REVISION} · built from merge ${MERGE_REVISION}`,
    )
  })
})
