import type { DrawElement, TagColorMode } from '../../core'
import { getColorPreviewClampInfo } from '../../core/renderer/preview-paint'
import type { PreviewDitherMode } from '../preferences/displayConfig'
import { collectElementColorValues } from './collect-element-colors'
import type { StatusMessage } from './status-messages'

/** Accent ink and its halftone — valid on any chromatic tag mode; only BW lacks accent. */
const ACCENT_INK_COLOR_NAMES = new Set(['accent', 'a', 'half_accent', 'ha'])

const UNSUPPORTED_COLORS_MESSAGE = "Color mode doesn't support all colors used"

function paintOptions(colorMode: TagColorMode, previewDitherMode: PreviewDitherMode) {
  return { colorMode, ditherMode: previewDitherMode }
}

/** Whether a YAML color name loses information on the active tag mode. */
export function colorNameHasClampLoss(
  colorName: string,
  colorMode: TagColorMode,
  previewDitherMode: PreviewDitherMode = 0,
): boolean {
  if (ACCENT_INK_COLOR_NAMES.has(colorName)) {
    if (colorMode !== 'bw') {
      return false
    }
  }

  return (
    getColorPreviewClampInfo(colorName, paintOptions(colorMode, previewDitherMode))?.lost === true
  )
}

export function elementHasColorClampLoss(
  element: DrawElement,
  colorMode: TagColorMode,
  previewDitherMode: PreviewDitherMode = 0,
): boolean {
  if (colorMode === 'rgb') {
    return false
  }

  return collectElementColorValues(element).some((colorName) =>
    colorNameHasClampLoss(colorName, colorMode, previewDitherMode),
  )
}

export function scanColorClampAffectedElements(
  elements: readonly DrawElement[],
  colorMode: TagColorMode,
  previewDitherMode: PreviewDitherMode = 0,
): number[] {
  const indices: number[] = []
  elements.forEach((element, index) => {
    if (elementHasColorClampLoss(element, colorMode, previewDitherMode)) {
      indices.push(index)
    }
  })
  return indices
}

export function getColorClampStatusMessage(
  elements: readonly DrawElement[],
  colorMode: TagColorMode,
  previewDitherMode: PreviewDitherMode = 0,
): StatusMessage | null {
  if (colorMode === 'rgb') {
    return null
  }

  const hasUnsupportedColors =
    scanColorClampAffectedElements(elements, colorMode, previewDitherMode).length > 0

  if (!hasUnsupportedColors) {
    return null
  }

  return {
    severity: 'warning',
    title: UNSUPPORTED_COLORS_MESSAGE,
    summary: UNSUPPORTED_COLORS_MESSAGE,
  }
}
