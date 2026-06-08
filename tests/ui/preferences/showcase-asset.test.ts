import { beforeEach, describe, expect, it } from 'vitest'
import { SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY } from '../../../src/ui/preferences/keys'
import {
  allowShowcaseBundledForDemo,
  isShowcaseBundledSuppressed,
  shouldUseBundledShowcaseImage,
  suppressShowcaseBundled,
} from '../../../src/ui/preferences/showcaseAsset'
import { BUNDLED_SHOWCASE_IMAGE_KEY } from '../../../src/core'

describe('showcase bundled image preference', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  })

  it('allows bundled showcase image by default', () => {
    expect(isShowcaseBundledSuppressed()).toBe(false)
    expect(shouldUseBundledShowcaseImage(BUNDLED_SHOWCASE_IMAGE_KEY, BUNDLED_SHOWCASE_IMAGE_KEY)).toBe(
      true,
    )
  })

  it('suppresses bundled showcase image after dismiss', () => {
    suppressShowcaseBundled()

    expect(isShowcaseBundledSuppressed()).toBe(true)
    expect(shouldUseBundledShowcaseImage(BUNDLED_SHOWCASE_IMAGE_KEY, BUNDLED_SHOWCASE_IMAGE_KEY)).toBe(
      false,
    )
  })

  it('re-enables bundled showcase image for a fresh demo load', () => {
    suppressShowcaseBundled()
    allowShowcaseBundledForDemo()

    expect(isShowcaseBundledSuppressed()).toBe(false)
  })
})
