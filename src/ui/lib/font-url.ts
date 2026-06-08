export function bundledFontUrl(key: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}fonts/${encodeURIComponent(key)}`
}
