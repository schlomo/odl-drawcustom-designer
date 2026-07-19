import type { AssetKind, AssetResolutionStatus, DrawElement } from '../../core'
import {
  BUNDLED_FONT_KEYS,
  guessMimeFromAssetKey,
  isImageMime,
  isSupportedFontKey,
  listContentMapKeys,
  scanPayloadForAssets,
  type AssetScanResult,
} from '../../core'
import { resolveContentAssetStatus } from './content-asset-status'

const bundledFontKeys = new Set<string>(BUNDLED_FONT_KEYS)

export interface ContentAssetRow {
  key: string
  kind: AssetKind
  paths: string[]
  status: AssetResolutionStatus
}

function inferAssetKind(key: string, fromScan?: AssetKind): AssetKind {
  if (fromScan) {
    return fromScan
  }

  if (isSupportedFontKey(key) || bundledFontKeys.has(key)) {
    return 'font'
  }

  const mime = guessMimeFromAssetKey(key)
  if (isImageMime(mime)) {
    return 'image'
  }

  return 'image'
}

function rowsFromScan(scan: AssetScanResult): ContentAssetRow[] {
  const byKey = new Map<string, ContentAssetRow>()

  for (const ref of scan.references) {
    if (bundledFontKeys.has(ref.key)) {
      continue
    }
    const existing = byKey.get(ref.key)
    if (existing) {
      existing.paths.push(ref.path)
      continue
    }
    byKey.set(ref.key, {
      key: ref.key,
      kind: ref.kind,
      paths: [ref.path],
      status: resolveContentAssetStatus(ref.key),
    })
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * "All" scope: a true superset of every stored asset (uploaded, whether
 * referenced or not) UNION every referenced asset (whether uploaded or not).
 * Before this, "All" only listed stored assets — a font referenced by an
 * element but never uploaded showed under "Current" with a MISSING badge,
 * then vanished entirely when switching to "All" (maintainer manual-test
 * finding on PR #54). "All" reading as a superset of "Current" is the
 * natural expectation, so a referenced-but-missing key must still appear
 * here, with the same MISSING badge "Current" already gives it.
 */
function rowsFromStored(scan: AssetScanResult): ContentAssetRow[] {
  const refsByKey = new Map<string, { kind: AssetKind; paths: string[] }>()

  for (const ref of scan.references) {
    if (bundledFontKeys.has(ref.key)) {
      continue
    }
    const existing = refsByKey.get(ref.key)
    if (existing) {
      existing.paths.push(ref.path)
      continue
    }
    refsByKey.set(ref.key, { kind: ref.kind, paths: [ref.path] })
  }

  const storedKeys = listContentMapKeys().filter((key) => !bundledFontKeys.has(key))
  const allKeys = new Set<string>(storedKeys)
  for (const key of refsByKey.keys()) {
    allKeys.add(key)
  }

  return [...allKeys]
    .map((key) => {
      const fromScan = refsByKey.get(key)
      return {
        key,
        kind: inferAssetKind(key, fromScan?.kind),
        paths: fromScan?.paths ?? [],
        status: resolveContentAssetStatus(key),
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function buildContentAssetRows(
  elements: DrawElement[],
  scope: 'current' | 'all',
): ContentAssetRow[] {
  const scan = scanPayloadForAssets(elements)
  return scope === 'current' ? rowsFromScan(scan) : rowsFromStored(scan)
}
