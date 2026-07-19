import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../ui/App'
import { defaultAppBootstrap, loadAppBootstrap } from '../ui/bootstrap/appBootstrap'
import { subscribeShareHashNavigation } from '../ui/bootstrap/shareHashNavigation'
import { readThemeMode, resolveThemeMode } from '../ui/preferences/theme'

/**
 * Standalone SPA mount (GH Pages runtime): document-level theme, IndexedDB
 * session bootstrap and share-hash navigation. The embedded runtime is
 * `mount()` in ./mount.tsx — same App shell, host-scoped behavior (#20).
 * Deliberately NOT exported from the library entry (./index.ts).
 */
export function mountStandaloneApp(container: HTMLElement): void {
  const initialMode = readThemeMode()
  const initialResolved = resolveThemeMode(
    initialMode,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  document.documentElement.classList.toggle('dark', initialResolved === 'dark')
  document.documentElement.dataset.theme = initialResolved

  const root = createRoot(container)
  let renderGeneration = 0

  function renderApp(bootstrap: ReturnType<typeof defaultAppBootstrap>) {
    renderGeneration += 1
    root.render(
      <StrictMode>
        <App key={renderGeneration} bootstrap={bootstrap} />
      </StrictMode>,
    )
  }

  async function bootstrapAndRender() {
    const bootstrap = await loadAppBootstrap()
    renderApp(bootstrap)
  }

  void bootstrapAndRender().catch((error) => {
    console.error('Failed to load saved session', error)
    renderApp(defaultAppBootstrap())
  })

  subscribeShareHashNavigation(() => {
    void bootstrapAndRender().catch((error) => {
      console.error('Failed to load share hash', error)
    })
  })
}
