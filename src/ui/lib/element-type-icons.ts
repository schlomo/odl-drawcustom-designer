import type { DrawElement } from '../../core'
import {
  mdiChartLine,
  mdiCircleOutline,
  mdiCodeBraces,
  mdiEllipseOutline,
  mdiFormatText,
  mdiFormatTextbox,
  mdiGrid,
  mdiImageOutline,
  mdiPercentCircleOutline,
  mdiQrcode,
  mdiRectangleOutline,
  mdiShapeOutline,
  mdiStarOutline,
  mdiStarPlusOutline,
  mdiVectorCurve,
  mdiVectorLine,
  mdiViewGridPlus,
} from '@mdi/js'

export interface ElementTypeIconEntry {
  /** MDI path from `@mdi/js`. */
  path: string
  /** Compact toolbar label (shown when space allows). */
  shortLabel: string
}

/**
 * Icon + compact label map for the Add Element toolbar.
 */
export const ELEMENT_TYPE_ICONS: Record<DrawElement['type'], ElementTypeIconEntry> = {
  debug_grid: { path: mdiViewGridPlus, shortLabel: 'Grid' },
  text: { path: mdiFormatText, shortLabel: 'Text' },
  multiline: { path: mdiFormatTextbox, shortLabel: 'Multi' },
  line: { path: mdiVectorLine, shortLabel: 'Line' },
  rectangle: { path: mdiRectangleOutline, shortLabel: 'Rect' },
  rectangle_pattern: { path: mdiGrid, shortLabel: 'Pattern' },
  polygon: { path: mdiShapeOutline, shortLabel: 'Poly' },
  circle: { path: mdiCircleOutline, shortLabel: 'Circle' },
  ellipse: { path: mdiEllipseOutline, shortLabel: 'Ellipse' },
  arc: { path: mdiVectorCurve, shortLabel: 'Arc' },
  icon: { path: mdiStarOutline, shortLabel: 'Icon' },
  icon_sequence: { path: mdiStarPlusOutline, shortLabel: 'Icons' },
  dlimg: { path: mdiImageOutline, shortLabel: 'Image' },
  qrcode: { path: mdiQrcode, shortLabel: 'QR' },
  plot: { path: mdiChartLine, shortLabel: 'Plot' },
  progress_bar: { path: mdiPercentCircleOutline, shortLabel: 'Progress' },
}

/** Placeholder for template/Jinja-heavy types in autocomplete contexts. */
export const ELEMENT_TEMPLATE_ICON = mdiCodeBraces
