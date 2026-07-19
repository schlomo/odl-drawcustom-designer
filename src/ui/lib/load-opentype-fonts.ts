import opentype from 'opentype.js'
import {
  BUNDLED_FONT_KEYS,
  clearFontUnavailable,
  markFontUnavailable,
  parseFont,
  registerFont,
  resolveAsset,
  isSupportedFontKey,
  unsupportedFontFormatMessage,
  unregisterFont,
} from '../../core'
import { bundledFontUrl } from './font-url'
import type { FontLoadBatchResult, FontLoadOutcome } from './font-load-outcome'

const opentypeFontCache = new Map<string, opentype.Font>()

function isFontAssetAvailable(key: string): boolean {
  const resolution = resolveAsset(key)
  return (
    resolution.status === 'resolved' ||
    resolution.status === 'bundled' ||
    BUNDLED_FONT_KEYS.includes(key as (typeof BUNDLED_FONT_KEYS)[number])
  )
}

export function evictOpentypeFont(key: string): void {
  opentypeFontCache.delete(key)
  unregisterFont(key)
}

export function getCachedOpentypeFont(key: string): opentype.Font | undefined {
  return opentypeFontCache.get(key)
}

export function areOpentypeFontMapsEqual(
  left: ReadonlyMap<string, opentype.Font>,
  right: ReadonlyMap<string, opentype.Font>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, font] of left) {
    if (right.get(key) !== font) {
      return false
    }
  }

  return true
}

function readyOutcome(key: string): FontLoadOutcome {
  // A font that just became ready is, by definition, no longer confirmed
  // unavailable — clear any stale mark from a previous failed attempt so
  // renderText/renderMultiline (fonts.ts) stop treating it as an error.
  clearFontUnavailable(key)
  return { key, status: 'ready' }
}

/**
 * Every non-ready outcome below is a confirmed, settled failure (not a
 * transient "still loading" state) — mark it unavailable in the core font
 * registry so renderText/renderMultiline switch from their wrong-metrics
 * fallback render to the explicit render-error placeholder (issue #53).
 */
function unavailableOutcome(key: string, status: 'missing' | 'failed', message: string): FontLoadOutcome {
  markFontUnavailable(key, message)
  return { key, status, message }
}

async function loadOpentypeFont(key: string): Promise<FontLoadOutcome> {
  if (
    !BUNDLED_FONT_KEYS.includes(key as (typeof BUNDLED_FONT_KEYS)[number]) &&
    !isSupportedFontKey(key)
  ) {
    return unavailableOutcome(key, 'failed', unsupportedFontFormatMessage(key))
  }

  // Clear a stale "confirmed unavailable" mark from a previous failed
  // attempt as soon as we know the asset now resolves — before any `await`
  // below. Without this, a font that was missing and then got uploaded would
  // keep showing the render-error placeholder for the *entire* fetch/parse
  // window of the retry, not just until the previous outcome was recorded
  // (PR #54 review comment 3610491466). A still-missing key must keep its
  // mark: `isFontAssetAvailable` is false for it, so this is a no-op there —
  // clearing unconditionally would introduce the opposite flicker (error
  // briefly disappears, wrong-metrics fallback shows, until the load
  // re-settles to missing).
  if (isFontAssetAvailable(key)) {
    clearFontUnavailable(key)
  }

  const cached = opentypeFontCache.get(key)
  if (cached) {
    if (isFontAssetAvailable(key)) {
      return readyOutcome(key)
    }
    evictOpentypeFont(key)
  }

  const resolution = resolveAsset(key)

  try {
    let font: opentype.Font
    if (resolution.status === 'resolved' && resolution.blob) {
      font = parseFont(await resolution.blob.arrayBuffer())
    } else if (
      resolution.status === 'bundled' ||
      BUNDLED_FONT_KEYS.includes(key as (typeof BUNDLED_FONT_KEYS)[number])
    ) {
      const response = await fetch(bundledFontUrl(key))
      if (!response.ok) {
        return unavailableOutcome(
          key,
          'failed',
          `${key} could not be fetched (${response.status} ${response.statusText}).`,
        )
      }
      font = parseFont(await response.arrayBuffer())
    } else {
      return unavailableOutcome(
        key,
        'missing',
        `${key} is not uploaded — add it in Content Manager or use ppb.ttf / rbm.ttf.`,
      )
    }

    opentypeFontCache.set(key, font)
    registerFont(key, font)
    return readyOutcome(key)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error'
    return unavailableOutcome(key, 'failed', `${key} could not be parsed (${detail}).`)
  }
}

export async function loadOpentypeFontMap(
  keys: readonly string[],
): Promise<Map<string, opentype.Font>> {
  const result = await loadOpentypeFontMapWithOutcomes(keys)
  return result.fonts
}

export async function loadOpentypeFontMapWithOutcomes(
  keys: readonly string[],
): Promise<FontLoadBatchResult> {
  const fonts = new Map<string, opentype.Font>()
  const outcomes = new Map<string, FontLoadOutcome>()
  const uniqueKeys = [...new Set(keys)]

  await Promise.all(
    uniqueKeys.map(async (key) => {
      const outcome = await loadOpentypeFont(key)
      outcomes.set(key, outcome)
      const font = opentypeFontCache.get(key)
      if (font) {
        fonts.set(key, font)
      }
    }),
  )

  return { fonts, outcomes }
}

export function clearOpentypeFontCacheForTests(): void {
  for (const key of opentypeFontCache.keys()) {
    evictOpentypeFont(key)
  }
}
