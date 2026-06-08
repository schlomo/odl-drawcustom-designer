import { scanPayloadForAssets } from '../../core'
import type { DrawElement } from '../../core'
import { resolveContentAssetStatus } from './content-asset-status'
import type { StatusMessage } from './status-messages'

export function getMissingAssetMessages(elements: DrawElement[]): StatusMessage[] {
  const scan = scanPayloadForAssets(elements)
  const missingKeys = new Map<string, string[]>()

  for (const ref of scan.references) {
    if (resolveContentAssetStatus(ref.key) !== 'missing') {
      continue
    }
    const paths = missingKeys.get(ref.key)
    if (paths) {
      paths.push(ref.path)
      continue
    }
    missingKeys.set(ref.key, [ref.path])
  }

  if (missingKeys.size === 0) {
    return []
  }

  const entries = [...missingKeys.entries()].sort(([left], [right]) => left.localeCompare(right))
  const keyList = entries.map(([key]) => key).join(', ')
  const pathList = entries.flatMap(([, paths]) => paths).join(', ')

  return [
    {
      severity: 'warning',
      title: 'Missing local assets',
      summary:
        entries.length === 1
          ? `Upload ${entries[0]![0]} to restore this shared design.`
          : `${entries.length} assets missing after import — upload via Content Manager.`,
      detail: `Keys: ${keyList}. YAML paths: ${pathList}.`,
    },
  ]
}
