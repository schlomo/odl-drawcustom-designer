import { BUNDLED_SHOWCASE_IMAGE_URL } from '../../assets/bundled-urls'
import { BUNDLED_SHOWCASE_IMAGE_KEY } from '../../core'

export function bundledShowcaseImageUrl(): string {
  return BUNDLED_SHOWCASE_IMAGE_URL
}

export function bundledImageUrl(key: string): string | null {
  if (key === BUNDLED_SHOWCASE_IMAGE_KEY) {
    return bundledShowcaseImageUrl()
  }
  return null
}
