export type AccentMode = 'red' | 'yellow'

export interface RenderContext {
  width: number
  height: number
  accentMode: AccentMode
}

export interface ColorOptions {
  accentMode?: AccentMode
}

export interface SvgLinePrimitive {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  dashed?: boolean
  dashLength?: number
  spaceLength?: number
}

export interface SvgRectPrimitive {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill: string | null
  stroke?: string
  strokeWidth?: number
  radius?: number
}

export interface SvgCirclePrimitive {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  fill: string | null
  stroke?: string
  strokeWidth?: number
}

export interface SvgEllipsePrimitive {
  kind: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
  fill: string | null
  stroke?: string
  strokeWidth?: number
}

export interface SvgPolygonPrimitive {
  kind: 'polygon'
  points: [number, number][]
  fill: string | null
  stroke?: string
  strokeWidth?: number
}

export interface SvgArcPrimitive {
  kind: 'arc'
  cx: number
  cy: number
  r: number
  startAngle: number
  endAngle: number
  fill: string | null
  stroke?: string
  strokeWidth?: number
}

export interface SvgIconStubPrimitive {
  kind: 'icon-stub'
  x: number
  y: number
  size: number
  value: string
  fill: string
}

export interface SvgIconSequenceStubPrimitive {
  kind: 'icon-sequence-stub'
  x: number
  y: number
  size: number
  icons: string[]
  direction: 'right' | 'left' | 'up' | 'down'
  spacing: number
  fill: string
}

export interface SvgRectanglePatternStubPrimitive {
  kind: 'rectangle-pattern-stub'
  rects: SvgRectPrimitive[]
}

export interface SvgProgressBarStubPrimitive {
  kind: 'progress-bar-stub'
  background: SvgRectPrimitive
  fill: SvgRectPrimitive
  progress: number
  showPercentage?: boolean
}

export interface SvgDebugGridStubPrimitive {
  kind: 'debug-grid-stub'
  width: number
  height: number
  spacing: number
  stroke: string
  dashed?: boolean
  dashLength?: number
  spaceLength?: number
}

export interface CanvasTextStubPrimitive {
  kind: 'text-stub'
  x: number
  y: number
  width: number
  height: number
  anchorX: number
  anchorY: number
  anchor?: string
  value: string
  color: string
  fontSize: number
  font?: string
}

export interface CanvasMultilineStubPrimitive {
  kind: 'multiline-stub'
  x: number
  y: number
  width: number
  height: number
  lines: string[]
  color: string
  fontSize: number
  font?: string
  lineSpacing?: number
}

export interface CanvasDlimgStubPrimitive {
  kind: 'dlimg-stub'
  x: number
  y: number
  width: number
  height: number
  url: string
  rotate?: number
  resizeMethod?: string
}

export interface CanvasQrcodeStubPrimitive {
  kind: 'qrcode-stub'
  x: number
  y: number
  width: number
  height: number
  data: string
  color: string
  bgcolor: string
}

export interface CanvasPlotStubPrimitive {
  kind: 'plot-stub'
  x: number
  y: number
  width: number
  height: number
  seriesCount: number
}

export type SvgPrimitive =
  | SvgLinePrimitive
  | SvgRectPrimitive
  | SvgCirclePrimitive
  | SvgEllipsePrimitive
  | SvgPolygonPrimitive
  | SvgArcPrimitive
  | SvgIconStubPrimitive
  | SvgIconSequenceStubPrimitive
  | SvgRectanglePatternStubPrimitive
  | SvgProgressBarStubPrimitive
  | SvgDebugGridStubPrimitive

export type CanvasPrimitive =
  | CanvasTextStubPrimitive
  | CanvasMultilineStubPrimitive
  | CanvasDlimgStubPrimitive
  | CanvasQrcodeStubPrimitive
  | CanvasPlotStubPrimitive

export type RenderPrimitive = SvgPrimitive | CanvasPrimitive

export interface SvgRenderResult {
  layer: 'svg'
  primitive: SvgPrimitive
}

export interface CanvasRenderResult {
  layer: 'canvas'
  primitive: CanvasPrimitive
}

export type RenderResult = SvgRenderResult | CanvasRenderResult
