import { useMemo, useState } from 'react'
import { BUNDLED_SHOWCASE_IMAGE_KEY, FONT_UPLOAD_ACCEPT, type AssetKind, type AssetUploadResult, type DrawElement } from '../../core'
import { buildContentAssetRows } from '../lib/content-asset-rows'
import { getScopedElementById } from '../lib/scoped-dom'
import { shell } from '../styles/shell'
import { PanelScopeToggle, type PanelListScope } from './PanelScopeToggle'

interface ContentManagerProps {
  elements: DrawElement[]
  assetRevision: number
  scope: PanelListScope
  onScopeChange: (scope: PanelListScope) => void
  onUpload: (key: string, kind: AssetKind, file: File) => Promise<AssetUploadResult>
  onClear: (key: string) => void
  embedded?: boolean
}

const STATUS_LABEL = {
  resolved: 'Resolved',
  bundled: 'Bundled',
  missing: 'Missing',
} as const

const STATUS_CLASS = {
  resolved: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  bundled: 'bg-sky-600/15 text-sky-700 dark:text-sky-400',
  missing: 'bg-amber-600/15 text-amber-800 dark:text-amber-400',
} as const

function kindLabel(kind: AssetKind): string {
  return kind === 'font' ? 'Font' : 'Image'
}

function acceptForKind(kind: AssetKind): string {
  return kind === 'font' ? FONT_UPLOAD_ACCEPT : 'image/*'
}

function uploadInputId(key: string): string {
  return `content-upload-${encodeURIComponent(key)}`
}

export function ContentManager({
  elements,
  assetRevision,
  scope,
  onScopeChange,
  onUpload,
  onClear,
  embedded = false,
}: ContentManagerProps) {
  const rows = useMemo(() => {
    void assetRevision
    return buildContentAssetRows(elements, scope)
  }, [elements, scope, assetRevision])
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  const handleUpload = async (row: (typeof rows)[number], file: File) => {
    setUploadingKey(row.key)
    try {
      const result = await onUpload(row.key, row.kind, file)
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
    } catch {
      setUploadErrors((current) => ({
        ...current,
        [row.key]: 'Could not save the file locally. Try reloading the page.',
      }))
    } finally {
      setUploadingKey(null)
    }
  }

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
    : `border-b ${shell.panelBorder} p-4`
  const listClassName = embedded
    ? 'mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto'
    : 'mt-3 max-h-48 space-y-2 overflow-y-auto'

  const emptyMessage =
    scope === 'current'
      ? 'No custom font or image references in the payload.'
      : 'No uploaded assets stored locally.'

  return (
    <Wrapper className={wrapperClass}>
      <div className={embedded ? 'shrink-0' : undefined}>
        {!embedded ? <h2 className={shell.heading}>Content manager</h2> : null}
        <div className={`flex items-start justify-between gap-2 ${embedded ? '' : 'mt-1'}`}>
          <p className={`min-w-0 flex-1 text-xs ${shell.muted}`}>
            Upload files for YAML asset paths. Keys match the exact path in YAML.
          </p>
          <PanelScopeToggle scope={scope} onScopeChange={onScopeChange} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={`${embedded ? 'mt-2' : 'mt-3'} text-xs ${shell.muted}`}>{emptyMessage}</p>
      ) : (
        <ul className={listClassName}>
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
                    {kindLabel(row.kind)}
                    {scope === 'current'
                      ? ` · ${row.paths.length} ref${row.paths.length === 1 ? '' : 's'}`
                      : row.paths.length > 0
                        ? ` · ${row.paths.length} ref${row.paths.length === 1 ? '' : 's'}`
                        : ' · stored'}
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
                <button
                  type="button"
                  className={`flex-1 ${uploadingKey === row.key ? 'opacity-60' : ''} ${shell.button} text-center`}
                  disabled={uploadingKey === row.key}
                  onClick={(event) => {
                    getScopedElementById(event.currentTarget, uploadInputId(row.key))?.click()
                  }}
                >
                  {uploadingKey === row.key
                    ? 'Checking…'
                    : row.status === 'resolved'
                      ? 'Replace'
                      : 'Upload'}
                </button>
                <input
                  id={uploadInputId(row.key)}
                  type="file"
                  accept={acceptForKind(row.kind)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={uploadingKey === row.key}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void handleUpload(row, file)
                    }
                    event.target.value = ''
                  }}
                />
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
                ) : row.status === 'bundled' && row.key === BUNDLED_SHOWCASE_IMAGE_KEY ? (
                  <button
                    type="button"
                    className={shell.button}
                    onClick={() => onClear(row.key)}
                    title="Hide the bundled demo image without storing a copy locally"
                  >
                    Hide demo
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
