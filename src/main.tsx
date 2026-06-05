import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
