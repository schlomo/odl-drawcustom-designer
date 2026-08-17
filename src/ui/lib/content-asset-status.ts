import {
  BUNDLED_SHOWCASE_IMAGE_KEY,
  hasHostSuppliedAsset,
  resolveAsset,
  type AssetResolutionStatus,
} from '../../core'
import { isShowcaseBundledSuppressed } from '../preferences/showcaseAsset'

/**
 * How an asset reference resolves, as the Content Manager and the missing-asset
 * banner see it: the content map's own three statuses plus `'host'` — supplied
 * by the embedding host's resolver (issue #138), the tier behind the local ones
 * (ADR-002). A host-supplied asset is genuinely there, so it must never be
 * reported as missing; it is badged distinctly because *where* it comes from is
 * what the user needs to know (an upload would override it).
 */
export type ContentAssetStatus = AssetResolutionStatus | 'host'

/** Content-map status with user dismiss applied for the bundled showcase image. */
export function resolveContentAssetStatus(key: string): ContentAssetStatus {
  const resolution = resolveAsset(key)
  if (
    key === BUNDLED_SHOWCASE_IMAGE_KEY &&
    isShowcaseBundledSuppressed() &&
    resolution.status === 'bundled'
  ) {
    return 'missing'
  }
  if (resolution.status === 'missing' && hasHostSuppliedAsset(key)) {
    return 'host'
  }
  return resolution.status
}
