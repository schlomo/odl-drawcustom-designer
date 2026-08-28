import { mountStandaloneApp } from './embed/standalone'
import { mountTouchDebugOverlayIfRequested } from './ui/lib/mountTouchDebugOverlay'
import './index.css'

mountStandaloneApp(document.getElementById('root')!)

// TEMPORARY (issue #153 hardware diagnosis): no-op unless the URL carries
// `?touchdebug=1` — see TouchDebugOverlay.tsx for removal note.
mountTouchDebugOverlayIfRequested()
