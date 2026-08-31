import type { PaletteOverrides, TagColorMode } from '../../core'
import { isTagColorMode } from '../../core'
import { DEFAULT_RESOLUTION } from '../data/resolution-picks'
import type { CanvasRotation } from '../lib/canvas-orientation'
import { DISPLAY_CONFIG_STORAGE_KEY } from './keys'

export type { CanvasRotation } from '../lib/canvas-orientation'
export type PreviewDitherMode = 0 | 2

export interface DisplayConfig {
  /**
   * The **logical drawing surface** the payload is authored against — already
   * oriented, exactly the canvas upstream `imagegen` creates (swapped for a
   * quarter turn) before drawing. Never the raw physical panel size; see
   * {@link rotation} and issue #139.
   */
  width: number
  height: number
  /**
   * Which way round the panel is: the orientation of {@link width}/
   * {@link height}, not a transform applied to the design. Its designer-side
   * effect is exactly that orientation — the canvas is always presented
   * upright — and it is carried so the send-time `rotate` can be computed per
   * target (issue #105).
   *
   * Absolute, never cumulative: this *is* the orientation, seeded from the
   * host and changeable by the user. Nothing sums it with anything else.
   *
   * Adopted **with** {@link width}/{@link height} and never on its own — see
   * {@link OrientedSurface}.
   */
  rotation: CanvasRotation
  colorMode: TagColorMode
  previewDitherMode: PreviewDitherMode
  /**
   * Measured panel hexes pushed by an embedding host (issue #68). Runtime
   * only — standalone never sets it and parseDisplayConfig never restores
   * it, so persisted display configs stay unchanged.
   */
  paletteOverrides?: PaletteOverrides
}

const ROTATIONS = new Set<CanvasRotation>([0, 90, 180, 270])
const PREVIEW_DITHER_MODES = new Set<PreviewDitherMode>([0, 2])

/**
 * The canonical display every adoption resolves from (`displaySpecToCanvas`)
 * and every bootstrap without a host display starts at.
 *
 * Frozen: it is handed out **by reference** (here and from `readDisplayConfig`)
 * and lands in live designer state from there, so an in-place edit anywhere
 * downstream would redefine the canonical defaults for every later adoption.
 * A caller that needs a config of its own spreads a copy.
 */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = Object.freeze({
  width: DEFAULT_RESOLUTION.width,
  height: DEFAULT_RESOLUTION.height,
  rotation: 0,
  colorMode: 'bwr',
  previewDitherMode: 0,
})

function isRotation(value: unknown): value is CanvasRotation {
  return typeof value === 'number' && ROTATIONS.has(value as CanvasRotation)
}

function isPreviewDitherMode(value: unknown): value is PreviewDitherMode {
  return typeof value === 'number' && PREVIEW_DITHER_MODES.has(value as PreviewDitherMode)
}

function parseColorMode(record: Record<string, unknown>): TagColorMode | null {
  if (isTagColorMode(record.colorMode)) {
    return record.colorMode
  }
  return null
}

export function parseDisplayConfig(value: unknown): DisplayConfig | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const width = record.width
  const height = record.height

  if (typeof width !== 'number' || !Number.isFinite(width) || width < 1) {
    return null
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height < 1) {
    return null
  }
  if (!isRotation(record.rotation)) {
    return null
  }

  const colorMode = parseColorMode(record)
  if (!colorMode) {
    return null
  }

  const previewDitherMode = isPreviewDitherMode(record.previewDitherMode)
    ? record.previewDitherMode
    : DEFAULT_DISPLAY_CONFIG.previewDitherMode

  return {
    width: Math.round(width),
    height: Math.round(height),
    rotation: record.rotation,
    colorMode,
    previewDitherMode,
  }
}

export function readDisplayConfig(): DisplayConfig {
  try {
    const raw = localStorage.getItem(DISPLAY_CONFIG_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_DISPLAY_CONFIG
    }
    const parsed = parseDisplayConfig(JSON.parse(raw))
    return parsed ?? DEFAULT_DISPLAY_CONFIG
  } catch {
    return DEFAULT_DISPLAY_CONFIG
  }
}

export function writeDisplayConfig(config: DisplayConfig): void {
  localStorage.setItem(DISPLAY_CONFIG_STORAGE_KEY, JSON.stringify(config))
}
