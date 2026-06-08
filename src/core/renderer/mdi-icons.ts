import * as mdiPaths from '@mdi/js'

/** Strip optional `mdi:` prefix and normalize to kebab-case lookup key. */
export function normalizeMdiIconName(value: string): string {
  return value.trim().replace(/^mdi:/i, '').toLowerCase()
}

/** Convert kebab-case icon name to `@mdi/js` export name (e.g. `home` → `mdiHome`). */
export function mdiExportName(iconName: string): string {
  const normalized = normalizeMdiIconName(iconName)
  return (
    'mdi' +
    normalized
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  )
}

/** Resolve a Material Design icon name to SVG path data, or null when unknown. */
export function resolveMdiPath(iconName: string): string | null {
  const exportName = mdiExportName(iconName)
  const path = (mdiPaths as Record<string, string>)[exportName]
  return typeof path === 'string' ? path : null
}

export function isKnownMdiIconName(iconName: string): boolean {
  return resolveMdiPath(iconName) !== null
}
