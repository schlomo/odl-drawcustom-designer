export function shouldHandleShareHashNavigation(hash: string): boolean {
  return hash.startsWith('#d=')
}

/** Re-run bootstrap when the user navigates to a new `#d=` link in the same tab. */
export function subscribeShareHashNavigation(onNavigate: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = () => {
    if (shouldHandleShareHashNavigation(window.location.hash)) {
      onNavigate()
    }
  }

  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}
