/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ContentManager } from '../../../src/ui/components/ContentManager'

/**
 * `hostOwnsAssets` hint (maintainer refinement 2026-09-01): a host that owns
 * assets may supply a short, plain-text hint rendered where the upload
 * control used to be ("upload content to the standard folders on HA
 * instead"). The designer's published surface stays domain-neutral
 * (ADR-018) — it never names host-specific paths itself — so the hint is
 * the host's own words, rendered verbatim and never as markup: a published
 * surface that interprets a host string as HTML/markdown is a footgun.
 */

const referencedElements: DrawElement[] = [
  { type: 'dlimg', url: '/media/pohl89-480h.png', x: 0, y: 0, xsize: 10, ysize: 10 },
]

const HOST_HINT = 'Add files to the media folder in your Home Assistant config.'

describe('ContentManager — host-supplied hint replaces the upload control', () => {
  it('renders the host hint where Upload was, with no upload/delete affordance reachable', () => {
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        assetUploadsHint={HOST_HINT}
      />,
    )

    expect(screen.getByText(HOST_HINT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('falls back to a neutral, domain-neutral sentence when the host declares ownership but supplies no hint', () => {
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
      />,
    )

    const fallback = screen.getByTestId('content-manager-intro')
    expect(fallback.textContent).toMatch(/host application/i)
    expect(fallback.textContent).toMatch(/nothing is stored in this browser/i)
    // Domain-neutral: never names a specific host or its directories.
    expect(fallback.textContent?.toLowerCase()).not.toContain('home assistant')
    expect(fallback.textContent?.toLowerCase()).not.toContain('/media')
    expect(fallback.textContent?.toLowerCase()).not.toContain('/config')
  })

  it('renders no hint and keeps the Upload control when write callbacks are supplied (unchanged default)', () => {
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        onUpload={vi.fn()}
        onClear={vi.fn()}
        assetUploadsHint={HOST_HINT}
      />,
    )

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(screen.queryByText(HOST_HINT)).toBeNull()
  })

  it('renders a hint containing markup characters literally, never interpreted as HTML or markdown', () => {
    const markupLikeHint = '<b>Upload</b> to **the host** & <script>alert(1)</script>'
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        assetUploadsHint={markupLikeHint}
      />,
    )

    expect(screen.getByText(markupLikeHint)).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
    expect(document.querySelector('script[src=""]')).toBeNull()
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })

  it('the hint container can wrap — no truncate/nowrap classes clip a long hint', () => {
    const longHint =
      'This is a deliberately long host-supplied hint sentence meant to verify that the narrow sidebar column wraps this text onto multiple lines instead of clipping it or forcing the column to grow wider than its container, which is a documented bug class in this repository.'
    render(
      <ContentManager
        elements={referencedElements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        assetUploadsHint={longHint}
      />,
    )

    const hintNode = screen.getByTestId('content-manager-intro')
    expect(hintNode.textContent).toBe(longHint)
    expect(hintNode.className).not.toMatch(/truncate/)
    expect(hintNode.className).not.toMatch(/whitespace-nowrap/)
    expect(hintNode.className).not.toMatch(/overflow-hidden/)
    // `min-w-0` is the established fix that lets a flex child wrap instead
    // of forcing its row wider (already used by this same paragraph today).
    expect(hintNode.className).toMatch(/min-w-0/)
  })
})
