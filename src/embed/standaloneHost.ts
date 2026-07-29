import { writeSessionToDb } from '../storage'
import { defaultAppBootstrap, loadAppBootstrap } from '../ui/bootstrap/appBootstrap'
import { subscribeShareHashNavigation } from '../ui/bootstrap/shareHashNavigation'
import { writeMockStates } from '../ui/preferences/mockStates'
import { writeVariables } from '../ui/preferences/variables'
import type { DesignerHost } from './host'

/**
 * Standalone SPA host adapter (issue #72, ADR-017): the GitHub Pages runtime.
 * Renders in the page's own DOM, owns the theme preference at document level,
 * persists everything to IndexedDB, and bootstraps from the saved session or
 * a `#d=` share hash (ADR-005) instead of a host-pushed payload.
 */
export function createStandaloneHost(): DesignerHost {
  let bootstrapped = false

  return {
    styleScope: 'page',
    theme: { owner: 'designer' },
    fill: 'viewport',
    shareLink: true,
    persistence: {
      writeSession: (payload) => void writeSessionToDb(payload),
      writeMocks: (mock) => void writeMockStates(mock),
      writeVariables: (variables) => void writeVariables(variables),
    },
    async loadBootstrap() {
      try {
        const bootstrap = await loadAppBootstrap()
        bootstrapped = true
        return bootstrap
      } catch (error) {
        if (bootstrapped) {
          // A failed re-bootstrap (share-hash navigation) keeps the session
          // the user is working in; the mount lifecycle logs the rejection.
          throw error
        }
        // The fallback app counts as bootstrapped: the user works in it from
        // here on, so a later failing `#d=` navigation must keep their screen
        // instead of falling into this branch again and remounting a fresh
        // default over their work.
        bootstrapped = true
        console.error('Failed to load saved session', error)
        return defaultAppBootstrap()
      }
    },
    subscribeBootstrapChanges(reload) {
      return subscribeShareHashNavigation(reload)
    },
  }
}
