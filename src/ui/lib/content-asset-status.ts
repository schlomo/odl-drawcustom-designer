import {
  BUNDLED_SHOWCASE_IMAGE_KEY,
  resolveAsset,
  type AssetResolutionStatus,
} from '../../core'
import { isShowcaseBundledSuppressed } from '../preferences/showcaseAsset'

/** Content-map status with user dismiss applied for the bundled showcase image. */
export function resolveContentAssetStatus(key: string): AssetResolutionStatus {
  const resolution = resolveAsset(key)
  if (
    key === BUNDLED_SHOWCASE_IMAGE_KEY &&
    isShowcaseBundledSuppressed() &&
    resolution.status === 'bundled'
  ) {
    return 'missing'
  }
  return resolution.status
}
