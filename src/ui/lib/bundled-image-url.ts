import { BUNDLED_SHOWCASE_IMAGE_KEY } from '../../core'

export function bundledShowcaseImageUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}showcase/showcase.png`
}

export function bundledImageUrl(key: string): string | null {
  if (key === BUNDLED_SHOWCASE_IMAGE_KEY) {
    return bundledShowcaseImageUrl()
  }
  return null
}
