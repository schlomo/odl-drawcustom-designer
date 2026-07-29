import { readThemeMode, resolveThemeMode } from '../ui/preferences/theme'
import { mountDesigner } from './mount'
import { createStandaloneHost } from './standaloneHost'
import type { MountHandle } from './types'

/**
 * Paint the stored theme preference on the document before React renders.
 * The standalone bootstrap is async (IndexedDB session + share hash), so
 * without this the first frame would flash the light theme for a dark-theme
 * user. Document-level theming is this adapter's policy — the shared mount
 * internals never touch `document.documentElement` (ADR-010, ADR-017).
 */
function applyStoredDocumentTheme(): void {
  const resolved = resolveThemeMode(
    readThemeMode(),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.dataset.theme = resolved
}

/**
 * Standalone SPA mount (GitHub Pages runtime): the standalone host adapter
 * over the same `mount()` lifecycle the library exports (issue #72, ADR-017).
 * Persistence, share-hash bootstrap and document-level theme are the
 * adapter's policy (./standaloneHost.ts); the lifecycle is shared.
 *
 * Deliberately NOT exported from the library entry (./index.ts).
 */
export function mountStandaloneApp(container: HTMLElement): MountHandle {
  applyStoredDocumentTheme()
  return mountDesigner(container, createStandaloneHost())
}
