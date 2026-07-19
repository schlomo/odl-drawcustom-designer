import ppbUrl from '../../assets/fonts/ppb.ttf?url'
import rbmUrl from '../../assets/fonts/rbm.ttf?url'

/**
 * Bundled fonts are imported assets, not `public/` fetches: the app build
 * emits them as hashed files (still fetched lazily), while the library build
 * inlines them as data URIs so the single-file embed bundle stays
 * self-contained (issue #20 — a host page has no /fonts/ directory).
 */
const BUNDLED_FONT_URLS: Record<string, string> = {
  'ppb.ttf': ppbUrl,
  'rbm.ttf': rbmUrl,
}

export function bundledFontUrl(key: string): string {
  const url = BUNDLED_FONT_URLS[key]
  if (!url) {
    throw new Error(`Unknown bundled font: ${key}`)
  }
  return url
}
