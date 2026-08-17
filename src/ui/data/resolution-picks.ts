import { reorientCanvasSize, type CanvasRotation } from '../lib/canvas-orientation'

export interface ResolutionPick {
  width: number
  height: number
}

/**
 * Common drawcustom display WxH quick-picks (dimensions only, no inch labels).
 *
 * Each entry is a display's **pair of dimensions**, listed once — the
 * orientation control decides which way round they go (issue #139), so the list
 * carries no portrait/landscape variants of the same panel.
 */
export const RESOLUTION_QUICK_PICKS: readonly ResolutionPick[] = [
  { width: 152, height: 152 },
  { width: 200, height: 200 },
  { width: 212, height: 104 },
  { width: 250, height: 122 },
  { width: 296, height: 128 },
  { width: 296, height: 152 },
  { width: 296, height: 160 },
  { width: 360, height: 184 },
  { width: 384, height: 168 },
  { width: 384, height: 184 },
  { width: 400, height: 300 },
  { width: 600, height: 448 },
  { width: 640, height: 384 },
  { width: 640, height: 960 },
  { width: 800, height: 480 },
  { width: 880, height: 528 },
  { width: 960, height: 672 },
] as const

export function compareResolutionPicks(left: ResolutionPick, right: ResolutionPick): number {
  return left.width - right.width || left.height - right.height
}

/** Quick-picks sorted by width (X), then height. */
export const SORTED_RESOLUTION_QUICK_PICKS: readonly ResolutionPick[] = [...RESOLUTION_QUICK_PICKS].sort(
  compareResolutionPicks,
)

export const DEFAULT_RESOLUTION: ResolutionPick = { width: 384, height: 184 }

export const CUSTOM_RESOLUTION_VALUE = 'custom'

export function formatResolutionLabel(width: number, height: number): string {
  return `${width}×${height}`
}

/**
 * The quick-pick a canvas of these dimensions *is* — **either way round**
 * (issue #139).
 *
 * A turned display is the same display: a 128×296 canvas is the 296×128 pick
 * held at a quarter turn, and must keep reading as that pick rather than
 * collapsing to "Custom". Orientation is reported by the orientation control,
 * never by this one.
 */
export function findResolutionPick(width: number, height: number): ResolutionPick | null {
  return (
    RESOLUTION_QUICK_PICKS.find((pick) => pick.width === width && pick.height === height) ??
    RESOLUTION_QUICK_PICKS.find((pick) => pick.width === height && pick.height === width) ??
    null
  )
}

/** The matching quick-pick's own label (its canonical way round), else Custom. */
export function resolutionSelectValue(width: number, height: number): string {
  const pick = findResolutionPick(width, height)
  return pick ? formatResolutionLabel(pick.width, pick.height) : CUSTOM_RESOLUTION_VALUE
}

/** Dropdown value when `editingCustom` is true (user chose Custom on a matching quick-pick size). */
export function resolutionDropdownValue(
  width: number,
  height: number,
  editingCustom: boolean,
): string {
  return editingCustom ? CUSTOM_RESOLUTION_VALUE : resolutionSelectValue(width, height)
}

export function shouldShowCustomResolutionInputs(
  width: number,
  height: number,
  editingCustom: boolean,
): boolean {
  return editingCustom || findResolutionPick(width, height) == null
}

/**
 * Apply a resolution-dropdown choice.
 *
 * A quick-pick names a display's two dimensions and says nothing about
 * orientation, so it lands **in the orientation the canvas is currently held
 * in** (issue #139): picking 296×128 at a quarter turn gives a 128×296 surface.
 * Only the orientation control changes which way round a display goes; only the
 * manual W/H inputs set literal numbers.
 */
export function applyResolutionSelectValue(
  value: string,
  handlers: {
    setEditingCustom: (editing: boolean) => void
    rotation: CanvasRotation
    onCanvasSizeChange: (width: number, height: number) => void
  },
): void {
  if (value === CUSTOM_RESOLUTION_VALUE) {
    handlers.setEditingCustom(true)
    return
  }

  const pick = parseResolutionSelectValue(value)
  if (pick == null) {
    return
  }

  handlers.setEditingCustom(false)
  // Quick-picks are stated upright; `rotation` says how the user is holding it.
  const { width, height } = reorientCanvasSize({ ...pick, rotation: 0 }, handlers.rotation)
  handlers.onCanvasSizeChange(width, height)
}

export function parseResolutionSelectValue(value: string): ResolutionPick | null {
  if (value === CUSTOM_RESOLUTION_VALUE) {
    return null
  }
  const match = /^(\d+)×(\d+)$/.exec(value)
  if (!match) {
    return null
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null
  }
  return findResolutionPick(width, height) ?? { width, height }
}
