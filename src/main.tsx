import { mountStandaloneApp } from './embed/standalone'
import { mountTouchDebugOverlayIfRequested } from './ui/lib/mountTouchDebugOverlay'
import './index.css'

mountStandaloneApp(document.getElementById('root')!)

// Permanent gated diagnostic (maintainer ruling, issue #153): no-op unless
// the URL carries `?touchdebug=1` — see TouchDebugOverlay.tsx.
mountTouchDebugOverlayIfRequested()
