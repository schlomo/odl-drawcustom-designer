import { createRoot } from 'react-dom/client'
import { TouchDebugOverlay } from '../components/TouchDebugOverlay'

/**
 * TEMPORARY (issue #153 hardware diagnosis). Gate + mount in one call: reads
 * `?touchdebug=1` once, and only then creates a detached React root outside
 * the app tree. No-op (no listeners, no DOM) when the param is absent — call
 * unconditionally from the standalone entry point (`src/main.tsx`).
 *
 * REMOVE (with TouchDebugOverlay.tsx and its call site in main.tsx) once
 * #153 is resolved, or once the maintainer explicitly rules "keep".
 */
const QUERY_PARAM = 'touchdebug'

export function mountTouchDebugOverlayIfRequested(): void {
  let enabled: boolean
  try {
    enabled = new URLSearchParams(window.location.search).get(QUERY_PARAM) === '1'
  } catch {
    enabled = false
  }
  if (!enabled) return

  const host = document.createElement('div')
  host.id = 'touch-debug-overlay-root'
  document.body.appendChild(host)
  createRoot(host).render(<TouchDebugOverlay />)
}
