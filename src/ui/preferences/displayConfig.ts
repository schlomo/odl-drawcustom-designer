import type { AccentMode } from '../../core'
import { DEFAULT_PRESET_ID, DISPLAY_PRESETS } from '../data/display-presets'
import { DISPLAY_CONFIG_STORAGE_KEY } from './keys'

export type CanvasRotation = 0 | 90 | 180 | 270
export type PreviewDitherMode = 0 | 2

export interface DisplayConfig {
  width: number
  height: number
  rotation: CanvasRotation
  accentMode: AccentMode
  previewDitherMode: PreviewDitherMode
}

const ROTATIONS = new Set<CanvasRotation>([0, 90, 180, 270])
const ACCENT_MODES = new Set<AccentMode>(['red', 'yellow'])
const PREVIEW_DITHER_MODES = new Set<PreviewDitherMode>([0, 2])

const defaultPreset = DISPLAY_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  width: defaultPreset.width ?? 384,
  height: defaultPreset.height ?? 184,
  rotation: 0,
  accentMode: 'red',
  previewDitherMode: 0,
}

function isRotation(value: unknown): value is CanvasRotation {
  return typeof value === 'number' && ROTATIONS.has(value as CanvasRotation)
}

function isAccentMode(value: unknown): value is AccentMode {
  return typeof value === 'string' && ACCENT_MODES.has(value as AccentMode)
}

function isPreviewDitherMode(value: unknown): value is PreviewDitherMode {
  return typeof value === 'number' && PREVIEW_DITHER_MODES.has(value as PreviewDitherMode)
}

export function parseDisplayConfig(value: unknown): DisplayConfig | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<DisplayConfig>
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
  if (!isAccentMode(record.accentMode)) {
    return null
  }

  const previewDitherMode = isPreviewDitherMode(record.previewDitherMode)
    ? record.previewDitherMode
    : DEFAULT_DISPLAY_CONFIG.previewDitherMode

  return {
    width: Math.round(width),
    height: Math.round(height),
    rotation: record.rotation,
    accentMode: record.accentMode,
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
