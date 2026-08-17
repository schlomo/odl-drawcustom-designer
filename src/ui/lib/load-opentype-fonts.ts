import opentype from 'opentype.js'
import {
  BUNDLED_FONT_KEYS,
  clearFontUnavailable,
  hasHostAssetResolver,
  hasHostSuppliedAsset,
  markFontUnavailable,
  parseFont,
  registerFont,
  registerHostAssetEvictor,
  resolveAsset,
  resolveHostAsset,
  isSupportedFontKey,
  unsupportedFontFormatMessage,
  unregisterFont,
} from '../../core'
import { bundledFontUrl } from './font-url'
import type { FontLoadBatchResult, FontLoadOutcome } from './font-load-outcome'

const opentypeFontCache = new Map<string, opentype.Font>()

/** A font the host already supplied counts as available: it resolves exactly
 * as a locally uploaded one does (issue #138), so the cached parse stays valid
 * and a stale unavailable mark clears as soon as the retry starts. */
function isFontAssetAvailable(key: string): boolean {
  const resolution = resolveAsset(key)
  return (
    resolution.status === 'resolved' ||
    resolution.status === 'bundled' ||
    BUNDLED_FONT_KEYS.includes(key as (typeof BUNDLED_FONT_KEYS)[number]) ||
    hasHostSuppliedAsset('font', key)
  )
}

export function evictOpentypeFont(key: string): void {
  opentypeFontCache.delete(key)
  unregisterFont(key)
}

/**
 * A host-supplied font lives in two caches that outlive the mount that fetched
 * it — this parsed-font map and the core font registry `getFont` reads. When
 * that mount goes away its bytes must go with it (issue #138): otherwise a
 * second host on the same page renders the *first* host's font for the same
 * name, and after the last mount the designer would keep painting a font
 * nothing can supply any more.
 *
 * Dropping it is not enough on its own: an unregistered font with no
 * "confirmed unavailable" mark reads to the renderer as *still loading*, which
 * is the silent-wrong-render state issue #10 rules out. So mark it — unless
 * another live mount still vouches for the name, in which case the next load
 * pass legitimately re-fetches it.
 */
registerHostAssetEvictor((kind, name) => {
  if (kind !== 'font') {
    return
  }
  evictOpentypeFont(name)
  if (!hasHostSuppliedAsset('font', name)) {
    markFontUnavailable(
      name,
      `${name} was supplied by an embedding host that is no longer connected — upload it in Content Manager or use ppb.ttf / rbm.ttf.`,
    )
  }
})

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

/** The local-only message, unchanged from before the host tier existed. */
function missingFontMessage(key: string): string {
  return `${key} is not uploaded — add it in Content Manager or use ppb.ttf / rbm.ttf.`
}

/**
 * Ask the host for a font the designer could not resolve locally (issue #138,
 * the last tier). Returns the parsed font, or the settled failure outcome that
 * puts the explicit render-error marker on every element referencing it.
 */
async function loadHostFont(
  key: string,
): Promise<{ font: opentype.Font } | { outcome: FontLoadOutcome }> {
  const supplied = await resolveHostAsset('font', key)

  if (supplied.status === 'blob') {
    return { font: parseFont(await supplied.blob.arrayBuffer()) }
  }

  if (supplied.status === 'url') {
    const response = await fetch(supplied.url)
    if (!response.ok) {
      return {
        outcome: unavailableOutcome(
          key,
          'failed',
          `${key} could not be fetched from the host (${response.status} ${response.statusText}).`,
        ),
      }
    }
    return { font: parseFont(await response.arrayBuffer()) }
  }

  if (supplied.status === 'failed') {
    return {
      outcome: unavailableOutcome(
        key,
        'failed',
        `${key} could not be supplied by the host (${supplied.message}).`,
      ),
    }
  }

  if (supplied.status === 'declined') {
    return {
      outcome: unavailableOutcome(
        key,
        'missing',
        `${key} could not be supplied by the host — upload it in Content Manager or use ppb.ttf / rbm.ttf.`,
      ),
    }
  }

  // 'absent': the mount was destroyed while this load was in flight, so there
  // is no host to blame — report the local-only message.
  return { outcome: unavailableOutcome(key, 'missing', missingFontMessage(key)) }
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
    } else if (hasHostAssetResolver()) {
      // Last tier (issue #138): the payload names an asset this designer has
      // never seen — the host resolves it from its own font directory.
      const fromHost = await loadHostFont(key)
      if ('outcome' in fromHost) {
        return fromHost.outcome
      }
      font = fromHost.font
    } else {
      return unavailableOutcome(key, 'missing', missingFontMessage(key))
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
