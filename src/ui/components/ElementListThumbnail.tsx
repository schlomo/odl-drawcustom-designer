import { resolveMdiPath } from '../../core/renderer/mdi-icons'
import type { ElementListThumbnail as ThumbnailMeta } from '../lib/element-list-row'
import { displayIconName } from '../lib/element-list-row'

interface ElementListThumbnailProps {
  thumbnail: ThumbnailMeta
  selected: boolean
}

const BOX_CLASS =
  'flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--shell-border)] bg-white/90'

export function ElementListThumbnail({ thumbnail, selected }: ElementListThumbnailProps) {
  const ink = selected ? 'var(--shell-accent)' : 'var(--shell-text)'

  switch (thumbnail.kind) {
    case 'mdi': {
      const path = resolveMdiPath(thumbnail.name)
      return (
        <span className={BOX_CLASS} aria-hidden title={displayIconName(thumbnail.name)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" role="presentation">
            {path ? (
              <path d={path} fill={ink} />
            ) : (
              <text x="12" y="16" textAnchor="middle" fontSize="10" fill={ink}>
                ?
              </text>
            )}
          </svg>
        </span>
      )
    }
    case 'mdi_sequence': {
      const primary = thumbnail.names[0]
      const path = primary ? resolveMdiPath(primary) : null
      const extra = thumbnail.total > 1 ? thumbnail.total - 1 : 0
      return (
        <span className={`${BOX_CLASS} relative`} aria-hidden title={primary ? displayIconName(primary) : 'icons'}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" role="presentation">
            {path ? (
              <path d={path} fill={ink} />
            ) : (
              <text x="12" y="16" textAnchor="middle" fontSize="10" fill={ink}>
                ?
              </text>
            )}
          </svg>
          {extra > 0 ? (
            <span className="absolute -bottom-0.5 -right-0.5 rounded bg-[var(--shell-surface-2)] px-0.5 text-[8px] leading-none text-[var(--shell-muted)]">
              +{extra}
            </span>
          ) : null}
        </span>
      )
    }
    case 'text':
      return (
        <span
          className={`${BOX_CLASS} font-mono text-[10px] font-semibold uppercase`}
          style={{ color: ink }}
          aria-hidden
        >
          {thumbnail.preview || 'T'}
        </span>
      )
    case 'color':
      return (
        <span className={BOX_CLASS} aria-hidden>
          <svg viewBox="0 0 16 16" className="h-4 w-4" role="presentation">
            {thumbnail.shape === 'line' ? (
              <line x1="2" y1="14" x2="14" y2="2" stroke={thumbnail.fill} strokeWidth="2" />
            ) : thumbnail.shape === 'circle' ? (
              <circle cx="8" cy="8" r="5" fill={thumbnail.fill} />
            ) : (
              <rect x="3" y="3" width="10" height="10" rx="1" fill={thumbnail.fill} />
            )}
          </svg>
        </span>
      )
    case 'badge':
      return (
        <span
          className={`${BOX_CLASS} text-[9px] font-semibold`}
          style={{ color: ink }}
          aria-hidden
        >
          {thumbnail.label}
        </span>
      )
    default: {
      const _exhaustive: never = thumbnail
      return _exhaustive
    }
  }
}
