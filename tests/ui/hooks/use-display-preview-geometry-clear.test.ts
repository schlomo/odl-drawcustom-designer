/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DISPLAY_PREVIEW_DEBOUNCE_MS,
  useDisplayPreview,
} from '../../../src/ui/hooks/useDisplayPreview'
import type { HostPreviewDisplayGeometry } from '../../../src/embed/types'

/**
 * Maintainer manual-validation finding on PR #143 (video evidence): a
 * geometry change (a resolution pick, a re-orientation) while Display preview
 * is active used to leave the *old* image on screen until the re-request
 * answered — the canvas re-orients first, the stale image letterboxes into
 * the new shape, then the new render lands. Two visible size jumps instead of
 * one clean transition.
 *
 * The fix: a geometry change clears the image (and shows the loading chip)
 * the instant it happens, well before the 250ms debounce even schedules the
 * re-request — a probe between the change and the answer must see no image.
 * Dither (and any other non-geometry re-request) is unaffected: it can never
 * change the image's dimensions, so swapping in place once the new answer
 * lands is still correct and still what happens.
 */

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function pngBlob(marker: string): Blob {
  return new Blob([marker], { type: 'image/png' })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'URL',
    class {
      static createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as Blob & { size: number }).size}`)
      static revokeObjectURL = vi.fn()
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(DISPLAY_PREVIEW_DEBOUNCE_MS)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useDisplayPreview — geometry change clears the stale image immediately', () => {
  it('drops the previous image the instant the display geometry changes, before the new render answers', async () => {
    const firstImage = pngBlob('first')
    const second = deferred<Blob>()
    const renderPreview = vi
      .fn()
      .mockResolvedValueOnce(firstImage)
      .mockReturnValueOnce(second.promise)

    const { result, rerender } = renderHook(
      ({ display }: { display: HostPreviewDisplayGeometry }) =>
        useDisplayPreview({
          renderPreview,
          readPayload: () => 'payload',
          ditherMode: 0,
          display,
          payloadRevision: 0,
        }),
      { initialProps: { display: { width: 296, height: 128, rotation: 0 as const } } },
    )

    act(() => result.current.toggle())
    await flushDebounce()
    expect(result.current.imageUrl).not.toBeNull()
    expect(result.current.loading).toBe(false)

    // A quarter turn re-orients the surface — probe right after the change,
    // before the debounced re-request has even fired.
    rerender({ display: { width: 128, height: 296, rotation: 90 } })

    expect(result.current.imageUrl).toBeNull()
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()

    await flushDebounce()
    expect(renderPreview).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve(pngBlob('second'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.imageUrl).not.toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('keeps the previous image on screen while only the dither mode changes (no letterbox risk)', async () => {
    const flat = pngBlob('flat')
    const dithered = deferred<Blob>()
    const renderPreview = vi
      .fn()
      .mockResolvedValueOnce(flat)
      .mockReturnValueOnce(dithered.promise)
    const display: HostPreviewDisplayGeometry = { width: 296, height: 128, rotation: 0 }

    const { result, rerender } = renderHook(
      ({ ditherMode }: { ditherMode: 0 | 2 }) =>
        useDisplayPreview({
          renderPreview,
          readPayload: () => 'payload',
          ditherMode,
          display,
          payloadRevision: 0,
        }),
      { initialProps: { ditherMode: 0 as 0 | 2 } },
    )

    act(() => result.current.toggle())
    await flushDebounce()
    const flatUrl = result.current.imageUrl
    expect(flatUrl).not.toBeNull()

    rerender({ ditherMode: 2 })

    // Unlike a geometry change, a dither-only change never invalidates the
    // image on screen: the old render stays up until the new one lands.
    expect(result.current.imageUrl).toBe(flatUrl)

    await act(async () => {
      vi.advanceTimersByTime(DISPLAY_PREVIEW_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.imageUrl).toBe(flatUrl)

    await act(async () => {
      dithered.resolve(pngBlob('dithered'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.imageUrl).not.toBe(flatUrl)
  })
})
