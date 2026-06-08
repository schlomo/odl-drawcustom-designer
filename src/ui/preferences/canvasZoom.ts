import { CANVAS_ZOOM_STORAGE_KEY } from './keys'

export type CanvasZoomMode = '200' | '100' | 'fit' | '50'

const MODES = new Set<CanvasZoomMode>(['200', '100', 'fit', '50'])
const DEFAULT_MODE: CanvasZoomMode = 'fit'

export function readCanvasZoomMode(): CanvasZoomMode {
  try {
    const raw = localStorage.getItem(CANVAS_ZOOM_STORAGE_KEY)
    if (raw && MODES.has(raw as CanvasZoomMode)) {
      return raw as CanvasZoomMode
    }
  } catch {
    // ignore
  }
  return DEFAULT_MODE
}

export function writeCanvasZoomMode(mode: CanvasZoomMode): void {
  localStorage.setItem(CANVAS_ZOOM_STORAGE_KEY, mode)
}
