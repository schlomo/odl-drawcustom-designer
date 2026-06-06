import { useState } from 'react'
import type { AssetKind, AssetResolutionStatus, AssetUploadResult, DrawElement } from '../../core'
import { resolveAsset, scanPayloadForAssets } from '../../core'
import { shell } from '../styles/shell'

interface ContentManagerProps {
  elements: DrawElement[]
  assetRevision: number
  onUpload: (key: string, kind: AssetKind, file: File) => Promise<AssetUploadResult>
  onClear: (key: string) => void
  embedded?: boolean
}

const STATUS_LABEL: Record<AssetResolutionStatus, string> = {
  resolved: 'Resolved',
  bundled: 'Bundled',
  missing: 'Missing',
}

const STATUS_CLASS: Record<AssetResolutionStatus, string> = {
  resolved: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  bundled: 'bg-sky-600/15 text-sky-700 dark:text-sky-400',
  missing: 'bg-amber-600/15 text-amber-800 dark:text-amber-400',
}

function kindLabel(kind: AssetKind): string {
  return kind === 'font' ? 'Font' : 'Image'
}

function acceptForKind(kind: AssetKind): string {
  return kind === 'font' ? '.ttf,.otf,.woff,.woff2' : 'image/*'
}

interface AssetRow {
  key: string
  kind: AssetKind
  paths: string[]
  status: AssetResolutionStatus
}

function buildAssetRows(elements: DrawElement[]): AssetRow[] {
  const scan = scanPayloadForAssets(elements)
  const byKey = new Map<string, AssetRow>()

  for (const ref of scan.references) {
    const existing = byKey.get(ref.key)
    if (existing) {
      existing.paths.push(ref.path)
      continue
    }
    byKey.set(ref.key, {
      key: ref.key,
      kind: ref.kind,
      paths: [ref.path],
      status: resolveAsset(ref.key).status,
    })
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function ContentManager({
  elements,
  assetRevision,
  onUpload,
  onClear,
  embedded = false,
}: ContentManagerProps) {
  void assetRevision

  const rows = buildAssetRows(elements)
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  const handleUpload = async (row: AssetRow, file: File) => {
    setUploadingKey(row.key)
    const result = await onUpload(row.key, row.kind, file)
    setUploadingKey(null)

    if (!result.ok) {
      setUploadErrors((current) => ({ ...current, [row.key]: result.message }))
      return
    }

    setUploadErrors((current) => {
      if (!(row.key in current)) {
        return current
      }
      const next = { ...current }
      delete next[row.key]
      return next
    })
  }

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded ? '' : `border-b ${shell.panelBorder} p-4`

  return (
    <Wrapper className={wrapperClass}>
      {!embedded ? <h2 className={shell.heading}>Content manager</h2> : null}
      <p className={`${embedded ? '' : 'mt-1'} text-xs ${shell.muted}`}>
        Upload files for YAML asset paths. Keys match the exact path in YAML.
      </p>

      {rows.length === 0 ? (
        <p className={`mt-3 text-xs ${shell.muted}`}>No font or image references in the payload.</p>
      ) : (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.key}
              className="rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface-2)] p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-[var(--shell-text)]" title={row.key}>
                    {row.key}
                  </p>
                  <p className={`mt-0.5 text-[10px] ${shell.muted}`}>
                    {kindLabel(row.kind)} · {row.paths.length} ref
                    {row.paths.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CLASS[row.status]}`}
                >
                  {STATUS_LABEL[row.status]}
                </span>
              </div>
              {uploadErrors[row.key] ? (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400" role="alert">
                  {uploadErrors[row.key]}
                </p>
              ) : null}
              <div className="mt-2 flex gap-1">
                <label
                  className={`flex-1 ${uploadingKey === row.key ? 'opacity-60' : 'cursor-pointer'} ${shell.button} text-center`}
                >
                  {uploadingKey === row.key
                    ? 'Checking…'
                    : row.status === 'resolved'
                      ? 'Replace'
                      : 'Upload'}
                  <input
                    type="file"
                    accept={acceptForKind(row.kind)}
                    className="sr-only"
                    disabled={uploadingKey === row.key}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void handleUpload(row, file)
                      }
                      event.target.value = ''
                    }}
                  />
                </label>
                {row.status === 'resolved' ? (
                  <button
                    type="button"
                    className={shell.button}
                    onClick={() => {
                      onClear(row.key)
                      setUploadErrors((current) => {
                        if (!(row.key in current)) {
                          return current
                        }
                        const next = { ...current }
                        delete next[row.key]
                        return next
                      })
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  )
}
