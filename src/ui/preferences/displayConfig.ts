import type { PaletteOverrides, TagColorMode } from '../../core'
import { isTagColorMode } from '../../core'
import { DEFAULT_RESOLUTION } from '../data/resolution-picks'
import { DISPLAY_CONFIG_STORAGE_KEY } from './keys'

export type CanvasRotation = 0 | 90 | 180 | 270
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

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  width: DEFAULT_RESOLUTION.width,
  height: DEFAULT_RESOLUTION.height,
  rotation: 0,
  colorMode: 'bwr',
  previewDitherMode: 0,
}

function isQuarterTurn(rotation: CanvasRotation): boolean {
  return rotation === 90 || rotation === 270
}

/**
 * Turn a logical drawing surface from one orientation to another (issue #139).
 *
 * A panel has two dimensions; the rotation says which of them is the width.
 * Moving between an upright rotation (0/180) and a quarter turn (90/270)
 * therefore swaps them; any other change leaves them alone. This is the *only*
 * thing rotation does to the canvas — nothing downstream turns a stage or a
 * raster.
 */
export function reorientCanvasSize(
  size: { width: number; height: number },
  from: CanvasRotation,
  to: CanvasRotation,
): { width: number; height: number } {
  return isQuarterTurn(from) === isQuarterTurn(to)
    ? { width: size.width, height: size.height }
    : { width: size.height, height: size.width }
}

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
