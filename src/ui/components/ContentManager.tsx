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
  /**
   * Absent when the host owns asset resolution (`hostOwnsAssets`, ADR-002):
   * the tab stays a read-only explorer — same rows, same status badges
   * (including **Host**, for whatever `resolveAsset` supplied) — with every
   * write affordance (Upload/Replace, the hidden file input, Clear, Hide
   * demo) omitted from the render tree rather than merely disabled.
   */
  onUpload?: (key: string, kind: AssetKind, file: File) => Promise<AssetUploadResult>
  onClear?: (key: string) => void
  /**
   * Host-supplied plain-text sentence rendered where the upload
   * instructions used to be, when `onUpload`/`onClear` are absent
   * (`hostOwnsAssets`'s `{ hint }` form). Rendered verbatim, as text only —
   * never parsed as HTML or Markdown. A missing or blank hint falls back to
   * {@link FALLBACK_HOST_ASSET_HINT}.
   */
  assetUploadsHint?: string
  embedded?: boolean
}

/**
 * Domain-neutral fallback (ADR-018) for `hostOwnsAssets` with no `{ hint }`
 * supplied — the designer cannot name the host's own upload location, so it
 * says only that the host provides assets and this browser stores none.
 */
const FALLBACK_HOST_ASSET_HINT =
  'Assets are provided by the host application. Nothing is stored in this browser.'

const STATUS_LABEL = {
  resolved: 'Resolved',
  bundled: 'Bundled',
  // Supplied by the embedding host's asset resolver (issue #138): present, but
  // from outside the designer — an upload would take precedence over it.
  host: 'Host',
  missing: 'Missing',
} as const

const STATUS_CLASS = {
  resolved: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  bundled: 'bg-sky-600/15 text-sky-700 dark:text-sky-400',
  host: 'bg-violet-600/15 text-violet-700 dark:text-violet-400',
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
  assetUploadsHint,
  embedded = false,
}: ContentManagerProps) {
  const rows = useMemo(() => {
    void assetRevision
    return buildContentAssetRows(elements, scope)
  }, [elements, scope, assetRevision])
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  const handleUpload = async (row: (typeof rows)[number], file: File) => {
    if (!onUpload) {
      return
    }
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

  // No `onUpload`/`onClear` is the `hostOwnsAssets` signal (App.tsx wires it
  // from `host.assetUploadsEnabled`, the same "conditional chrome, presence
  // gates it" pattern `actions`/`targets`/`renderPreview` already use) — the
  // two callbacks are always supplied or withheld together.
  const readOnly = onUpload == null

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
    : `border-b ${shell.panelBorder} p-4`
  const listClassName = embedded
    ? 'mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto'
    : 'mt-3 max-h-48 space-y-2 overflow-y-auto'

  // Read-only mode never stores anything locally, so "all" can never hold
  // more than "current" holds — both scopes converge on the same genuinely-
  // empty case: nothing in the payload references a font or image. Never
  // claim assets are unavailable; the tab keeps listing whatever the payload
  // does reference, host-resolved entries included (rows below), exactly as
  // the maintainer verified on live hardware — HOST-badged rows for names
  // never uploaded to this browser.
  const emptyMessage =
    scope === 'current' || readOnly
      ? 'No custom font or image references in the payload.'
      : 'No uploaded assets stored locally.'

  // Plain text only, always — never `dangerouslySetInnerHTML`, never parsed
  // as Markdown. `{introText}` is a JSX text child, so React escapes it the
  // same way it does the designer's own copy below; a host string containing
  // `<b>`/`**`/`<script>` renders as those literal characters, never markup.
  const introText = readOnly
    ? assetUploadsHint && assetUploadsHint.trim() !== ''
      ? assetUploadsHint
      : FALLBACK_HOST_ASSET_HINT
    : 'Upload files for YAML asset paths. Keys match the exact path in YAML.'

  return (
    <Wrapper className={wrapperClass}>
      <div className={embedded ? 'shrink-0' : undefined}>
        {!embedded ? <h2 className={shell.heading}>Content manager</h2> : null}
        <div className={`flex items-start justify-between gap-2 ${embedded ? '' : 'mt-1'}`}>
          <p
            data-testid="content-manager-intro"
            className={`min-w-0 flex-1 text-xs ${shell.muted}`}
          >
            {introText}
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
              {onUpload || onClear ? (
                <div className="mt-2 flex gap-1">
                  {onUpload ? (
                    <>
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
                    </>
                  ) : null}
                  {onClear && row.status === 'resolved' ? (
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
                  ) : onClear && row.status === 'bundled' && row.key === BUNDLED_SHOWCASE_IMAGE_KEY ? (
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  )
}
