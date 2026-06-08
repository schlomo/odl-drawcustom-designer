import { describe, expect, it } from 'vitest'
import { BUNDLED_SHOWCASE_IMAGE_KEY, resolveAsset } from '../../../src/core'
import { resolveContentAssetStatus } from '../../../src/ui/lib/content-asset-status'
import { suppressShowcaseBundled } from '../../../src/ui/preferences/showcaseAsset'

describe('resolveContentAssetStatus', () => {
  it('reports bundled showcase image status from the resolver', () => {
    expect(resolveAsset(BUNDLED_SHOWCASE_IMAGE_KEY).status).toBe('bundled')
    expect(resolveContentAssetStatus(BUNDLED_SHOWCASE_IMAGE_KEY)).toBe('bundled')
  })

  it('reports missing after the bundled showcase image is dismissed', () => {
    suppressShowcaseBundled()
    expect(resolveContentAssetStatus(BUNDLED_SHOWCASE_IMAGE_KEY)).toBe('missing')
  })
})
