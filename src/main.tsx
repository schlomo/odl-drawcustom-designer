import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultAppBootstrap, loadAppBootstrap } from './ui/bootstrap/appBootstrap'
import { readThemeMode, resolveThemeMode } from './ui/preferences/theme'
import { App } from './ui/App'
import './index.css'

const initialMode = readThemeMode()
const initialResolved = resolveThemeMode(
  initialMode,
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)
document.documentElement.classList.toggle('dark', initialResolved === 'dark')
document.documentElement.dataset.theme = initialResolved

const root = createRoot(document.getElementById('root')!)

function renderApp(bootstrap: ReturnType<typeof defaultAppBootstrap>) {
  root.render(
    <StrictMode>
      <App bootstrap={bootstrap} />
    </StrictMode>,
  )
}

void loadAppBootstrap()
  .then(renderApp)
  .catch((error) => {
    console.error('Failed to load saved session', error)
    renderApp(defaultAppBootstrap())
  })
