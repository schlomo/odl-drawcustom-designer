export interface ResolutionPick {
  width: number
  height: number
}

/** Common OEPL WxH quick-picks (§7.3 — dimensions only, no inch labels). */
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
  { width: 168, height: 384 },
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

export function findResolutionPick(width: number, height: number): ResolutionPick | null {
  return (
    RESOLUTION_QUICK_PICKS.find((pick) => pick.width === width && pick.height === height) ?? null
  )
}

export function resolutionSelectValue(width: number, height: number): string {
  return findResolutionPick(width, height)
    ? formatResolutionLabel(width, height)
    : CUSTOM_RESOLUTION_VALUE
}

/** Dropdown value when `editingCustom` is true (user chose Custom on a matching quick-pick size). */
export function resolutionDropdownValue(
  width: number,
  height: number,
  editingCustom: boolean,
): string {
  if (editingCustom || findResolutionPick(width, height) == null) {
    return CUSTOM_RESOLUTION_VALUE
  }
  return formatResolutionLabel(width, height)
}

export function shouldShowCustomResolutionInputs(
  width: number,
  height: number,
  editingCustom: boolean,
): boolean {
  return editingCustom || findResolutionPick(width, height) == null
}

export function applyResolutionSelectValue(
  value: string,
  handlers: {
    setEditingCustom: (editing: boolean) => void
    onApplyResolution: (width: number, height: number) => void
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
  handlers.onApplyResolution(pick.width, pick.height)
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
