import type { DrawElement, ServiceOptions } from '../core'
import {
  accentModeToColorMode,
  colorModeToAccent,
  isTagColorMode,
  type TagColorMode,
} from '../core/display/palette'
import type { DisplayConfig } from '../ui/preferences/displayConfig'

export const SHARE_PAYLOAD_VERSION = 1 as const

export interface ShareCanvas {
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  /** v1 share links — kept for backward compatibility. */
  accent: 'red' | 'yellow'
  colorMode?: TagColorMode
}

export interface SharePayload {
  v: typeof SHARE_PAYLOAD_VERSION
  name: string
  canvas: ShareCanvas
  service?: ServiceOptions
  elements: DrawElement[]
}

export interface ShareBuildInput {
  name: string
  canvas: DisplayConfig
  service?: ServiceOptions
  elements: DrawElement[]
}

export function buildSharePayload(input: ShareBuildInput): SharePayload {
  const payload: SharePayload = {
    v: SHARE_PAYLOAD_VERSION,
    name: input.name,
    canvas: {
      width: input.canvas.width,
      height: input.canvas.height,
      rotation: input.canvas.rotation,
      accent: colorModeToAccent(input.canvas.colorMode),
      colorMode: input.canvas.colorMode,
    },
    elements: input.elements,
  }

  const service: ServiceOptions = { ...(input.service ?? {}) }
  if (input.canvas.previewDitherMode === 2) {
    service.dither = 2
  }

  if (Object.keys(service).length > 0) {
    payload.service = service
  }

  return payload
}

export function shareCanvasToDisplayConfig(
  canvas: ShareCanvas,
  previewDitherMode: DisplayConfig['previewDitherMode'],
): DisplayConfig {
  const colorMode =
    canvas.colorMode != null && isTagColorMode(canvas.colorMode)
      ? canvas.colorMode
      : accentModeToColorMode(canvas.accent)

  return {
    width: canvas.width,
    height: canvas.height,
    rotation: canvas.rotation,
    colorMode,
    previewDitherMode,
  }
}

export function resolvePreviewDitherFromShare(
  service: ServiceOptions | undefined,
): DisplayConfig['previewDitherMode'] {
  if (service?.dither === 2) {
    return 2
  }
  return 0
}
