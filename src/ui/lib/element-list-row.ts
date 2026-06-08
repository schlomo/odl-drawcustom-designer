import type { DrawElement } from '../../core'
import { normalizeMdiIconName } from '../../core/renderer/mdi-icons'

export type ElementListThumbnail =
  | { kind: 'mdi'; name: string }
  | { kind: 'mdi_sequence'; names: string[]; total: number }
  | { kind: 'text'; preview: string }
  | { kind: 'color'; fill: string; shape: 'square' | 'circle' | 'line' }
  | { kind: 'badge'; label: string }

export interface ElementListRowMeta {
  typeLabel: string
  /** Rendered first-line preview; truncated in the UI when space is tight. */
  detail: string | null
  thumbnail: ElementListThumbnail
}

function typeLabelFor(element: DrawElement): string {
  return element.type.replace(/_/g, ' ')
}

/** First line only, collapsed whitespace — display truncation is handled in CSS. */
export function firstLinePreview(value: string): string {
  const line = value.split('\n')[0]?.replace(/\r/g, '') ?? ''
  return line.replace(/\s+/g, ' ').trim()
}

function numericLabel(value: number | string | undefined): string | null {
  if (value === undefined) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.round(value))
  }
  if (typeof value === 'string') {
    const preview = firstLinePreview(value)
    return preview === '' ? null : preview
  }
  return null
}

function colorFill(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  return value
}

function positionDetail(element: DrawElement): string | null {
  switch (element.type) {
    case 'text':
    case 'multiline':
    case 'icon':
    case 'icon_sequence':
    case 'circle':
    case 'arc':
    case 'qrcode':
      return [numericLabel(element.x), numericLabel(element.y)].filter(Boolean).join(', ') || null
    case 'line':
      return (
        [
          numericLabel(element.x_start),
          numericLabel(element.y_start ?? 0),
          '→',
          numericLabel(element.x_end),
          numericLabel(element.y_end ?? 0),
        ]
          .filter((part) => part !== null)
          .join(' ') || null
      )
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
    case 'plot':
      return (
        [
          numericLabel(element.x_start),
          numericLabel(element.y_start),
          '→',
          numericLabel(element.x_end),
          numericLabel(element.y_end),
        ]
          .filter((part) => part !== null)
          .join(' ') || null
      )
    case 'dlimg': {
      const parts = [numericLabel(element.x), numericLabel(element.y)].filter(Boolean)
      return parts.length > 0 ? parts.join(', ') : null
    }
    default:
      return null
  }
}

function fileNameFromUrl(url: string): string {
  const trimmed = url.trim()
  const withoutQuery = trimmed.split('?')[0] ?? trimmed
  const segments = withoutQuery.split('/')
  return segments[segments.length - 1] || trimmed
}

/** Sidebar row label, detail, and thumbnail for one preview (template-evaluated) element. */
export function elementListRowMeta(element: DrawElement): ElementListRowMeta {
  const typeLabel = typeLabelFor(element)

  switch (element.type) {
    case 'icon':
      return {
        typeLabel,
        detail: displayIconName(element.value),
        thumbnail: { kind: 'mdi', name: element.value },
      }
    case 'icon_sequence':
      return {
        typeLabel,
        detail: `${element.icons.length} icons`,
        thumbnail: {
          kind: 'mdi_sequence',
          names: element.icons.slice(0, 1),
          total: element.icons.length,
        },
      }
    case 'text':
      return {
        typeLabel,
        detail: element.value ? firstLinePreview(element.value) : positionDetail(element),
        thumbnail: {
          kind: 'text',
          preview: element.value ? firstLinePreview(element.value).slice(0, 2) : 'T',
        },
      }
    case 'multiline':
      return {
        typeLabel,
        detail: element.value ? firstLinePreview(element.value) : positionDetail(element),
        thumbnail: { kind: 'badge', label: '¶' },
      }
    case 'line':
      return {
        typeLabel,
        detail: positionDetail(element),
        thumbnail: {
          kind: 'color',
          fill: colorFill(element.fill) ?? 'currentColor',
          shape: 'line',
        },
      }
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
      return {
        typeLabel,
        detail: positionDetail(element),
        thumbnail: {
          kind: 'color',
          fill: colorFill('fill' in element ? element.fill : undefined) ?? 'currentColor',
          shape: element.type === 'ellipse' ? 'circle' : 'square',
        },
      }
    case 'circle':
    case 'arc':
      return {
        typeLabel,
        detail: positionDetail(element),
        thumbnail: {
          kind: 'color',
          fill: colorFill(element.fill) ?? 'currentColor',
          shape: 'circle',
        },
      }
    case 'dlimg':
      return {
        typeLabel,
        detail: firstLinePreview(fileNameFromUrl(element.url)),
        thumbnail: { kind: 'badge', label: 'IMG' },
      }
    case 'qrcode':
      return {
        typeLabel,
        detail: firstLinePreview(element.data),
        thumbnail: { kind: 'badge', label: 'QR' },
      }
    case 'plot':
      return {
        typeLabel,
        detail: `${element.data.length} series`,
        thumbnail: { kind: 'badge', label: '📈' },
      }
    case 'polygon':
      return {
        typeLabel,
        detail: `${element.points.length} points`,
        thumbnail: { kind: 'badge', label: '▱' },
      }
    case 'rectangle_pattern':
      return {
        typeLabel,
        detail: positionDetail(element),
        thumbnail: { kind: 'badge', label: '▦' },
      }
    case 'debug_grid':
      return {
        typeLabel,
        detail: null,
        thumbnail: { kind: 'badge', label: '#' },
      }
    default:
      return {
        typeLabel,
        detail: null,
        thumbnail: { kind: 'badge', label: '?' },
      }
  }
}

/** Normalized MDI name for display (no mdi: prefix). */
export function displayIconName(value: string): string {
  return normalizeMdiIconName(value)
}
