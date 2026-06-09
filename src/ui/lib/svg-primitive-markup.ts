import { buildArcPiePath, type SvgPrimitive, type TagColorMode, type DitherMode } from '../../core'
import { clampStrokeWidth, resolveSvgFontFamily } from './svg-font-family'

const MDI_VIEWBOX_SIZE = 24
const UNKNOWN_ICON_BACKGROUND = '#FFFFFF'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xmlColor(value: string | null | undefined, fallback = 'none'): string {
  return escapeXml(value ?? fallback)
}

function mdiIconMarkup(x: number, y: number, size: number, path: string, fill: string): string {
  const scale = size / MDI_VIEWBOX_SIZE
  return `<g transform="translate(${x}, ${y}) scale(${scale})"><path d="${path}" fill="${escapeXml(fill)}"/></g>`
}

function unknownIconMarkup(
  x: number,
  y: number,
  size: number,
  label: string,
  fill: string,
): string {
  const fontSize = Math.min(11, Math.max(8, size / 10))
  const text = label.length > 14 ? `${label.slice(0, 12)}…` : label
  return `<g><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${UNKNOWN_ICON_BACKGROUND}" stroke="${escapeXml(fill)}" stroke-width="1" stroke-dasharray="4 2"/><text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" fill="${escapeXml(fill)}">${escapeXml(text)}</text></g>`
}

export interface SvgPrimitiveMarkupOptions {
  colorMode?: TagColorMode
  ditherMode?: DitherMode
  patternDefs?: string
}

export function renderSvgPrimitiveMarkup(
  primitive: SvgPrimitive,
  fontFamilies: ReadonlyMap<string, string> = new Map(),
  options: SvgPrimitiveMarkupOptions = {},
): string {
  const markup = renderSvgPrimitiveBody(primitive, fontFamilies)
  if (!options.patternDefs) {
    return markup
  }
  return `<defs>${options.patternDefs}</defs>${markup}`
}

function renderSvgPrimitiveBody(
  primitive: SvgPrimitive,
  fontFamilies: ReadonlyMap<string, string>,
): string {
  switch (primitive.kind) {
    case 'line':
      return `<line x1="${primitive.x1}" y1="${primitive.y1}" x2="${primitive.x2}" y2="${primitive.y2}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}"${primitive.dashed ? ` stroke-dasharray="${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}"` : ''}/>`
    case 'rect':
      return `<rect x="${primitive.x}" y="${primitive.y}" width="${primitive.width}" height="${primitive.height}" fill="${xmlColor(primitive.fill)}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}" rx="${primitive.radius ?? 0}"/>`
    case 'circle':
      return `<circle cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.r}" fill="${xmlColor(primitive.fill)}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}"/>`
    case 'ellipse':
      return `<ellipse cx="${primitive.cx}" cy="${primitive.cy}" rx="${primitive.rx}" ry="${primitive.ry}" fill="${xmlColor(primitive.fill)}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}"/>`
    case 'polygon': {
      const points = primitive.points.map(([x, y]) => `${x},${y}`).join(' ')
      return `<polygon points="${points}" fill="${xmlColor(primitive.fill)}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}"/>`
    }
    case 'arc':
      return `<path d="${buildArcPiePath(primitive.cx, primitive.cy, primitive.r, primitive.startAngle, primitive.endAngle)}" fill="${xmlColor(primitive.fill)}" stroke="${xmlColor(primitive.stroke)}" stroke-width="${clampStrokeWidth(primitive.strokeWidth)}"/>`
    case 'icon': {
      const label = primitive.value.replace(/^mdi:/, '')
      if (primitive.path) {
        return mdiIconMarkup(primitive.x, primitive.y, primitive.size, primitive.path, primitive.fill)
      }
      return unknownIconMarkup(primitive.x, primitive.y, primitive.size, label, primitive.fill)
    }
    case 'icon_sequence':
      return `<g>${primitive.icons
        .map((icon) =>
          icon.path
            ? mdiIconMarkup(icon.x, icon.y, primitive.size, icon.path, primitive.fill)
            : unknownIconMarkup(
                icon.x,
                icon.y,
                primitive.size,
                icon.name.replace(/^mdi:/, ''),
                primitive.fill,
              ),
        )
        .join('')}</g>`
    case 'rectangle-pattern-stub':
      return `<g>${primitive.rects
        .map(
          (rect) =>
            `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${xmlColor(rect.fill)}" stroke="${xmlColor(rect.stroke)}" stroke-width="${clampStrokeWidth(rect.strokeWidth)}" rx="${rect.radius ?? 0}"/>`,
        )
        .join('')}</g>`
    case 'progress-bar-stub': {
      const progressLabel = `${Math.round(Math.min(100, Math.max(0, primitive.progress)))}%`
      const percentageFontFamily = escapeXml(
        resolveSvgFontFamily(primitive.percentageFontKey, fontFamilies),
      )
      return `<g><rect x="${primitive.background.x}" y="${primitive.background.y}" width="${primitive.background.width}" height="${primitive.background.height}" fill="${xmlColor(primitive.background.fill, '#FFFFFF')}" stroke="${xmlColor(primitive.background.stroke)}" stroke-width="${clampStrokeWidth(primitive.background.strokeWidth)}"/><rect x="${primitive.fill.x}" y="${primitive.fill.y}" width="${primitive.fill.width}" height="${primitive.fill.height}" fill="${xmlColor(primitive.fill.fill, '#000000')}"/>${
        primitive.showPercentage
          ? `<text x="${primitive.background.x + primitive.background.width / 2}" y="${primitive.background.y + primitive.background.height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${primitive.percentageFontSize ?? 12}" font-family="${percentageFontFamily}" fill="${escapeXml(primitive.percentageColor ?? '#000000')}">${escapeXml(progressLabel)}</text>`
          : ''
      }</g>`
    }
    case 'debug-grid-stub': {
      const labelFontSize = primitive.labelFontSize ?? 12
      const labelFontFamily = escapeXml(resolveSvgFontFamily(primitive.labelFontKey, fontFamilies))
      const labelStep = primitive.labelStep ?? 40
      const lines: string[] = []
      const labels: string[] = []

      for (let x = 0; x <= primitive.width; x += primitive.spacing) {
        lines.push(
          `<line x1="${x}" y1="0" x2="${x}" y2="${primitive.height}" stroke="${escapeXml(primitive.stroke)}" stroke-width="0.5"${primitive.dashed ? ` stroke-dasharray="${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}"` : ''}/>`,
        )
        if (primitive.showLabels && x % labelStep === 0 && x !== 0) {
          labels.push(
            `<text x="${x + 2}" y="2" dominant-baseline="hanging" font-size="${labelFontSize}" font-family="${labelFontFamily}" fill="${escapeXml(primitive.labelColor ?? primitive.stroke)}">${x}</text>`,
          )
        }
      }
      for (let y = 0; y <= primitive.height; y += primitive.spacing) {
        lines.push(
          `<line x1="0" y1="${y}" x2="${primitive.width}" y2="${y}" stroke="${escapeXml(primitive.stroke)}" stroke-width="0.5"${primitive.dashed ? ` stroke-dasharray="${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}"` : ''}/>`,
        )
        if (primitive.showLabels && y % labelStep === 0 && y !== 0) {
          labels.push(
            `<text x="2" y="${y}" dominant-baseline="middle" font-size="${labelFontSize}" font-family="${labelFontFamily}" fill="${escapeXml(primitive.labelColor ?? primitive.stroke)}">${y}</text>`,
          )
        }
      }
      if (primitive.showLabels) {
        labels.push(
          `<text x="2" y="2" dominant-baseline="hanging" font-size="${labelFontSize}" font-family="${labelFontFamily}" fill="${escapeXml(primitive.labelColor ?? primitive.stroke)}">0</text>`,
        )
      }
      return `<g>${lines.join('')}${labels.join('')}</g>`
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
