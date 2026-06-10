import { useCallback, useEffect, useState, type RefObject } from 'react'

export const MIN_CANVAS_PREVIEW_HEIGHT = 72

/** Default YAML panel height as a fraction of the canvas/YAML column when unset. */
export const DEFAULT_PANEL_HEIGHT_FRACTION = 0.5

interface ResizablePanelHeightOptions {
  storageKey: string
  minHeight: number
  minSiblingHeight: number
  containerRef: RefObject<HTMLElement | null>
  /** Fallback pixel height before the column is measured. */
  defaultHeight?: number
  /** Fraction of column height when no stored value exists (default 0.5). */
  defaultHeightFraction?: number
}

export function getMaxPanelHeight(
  container: HTMLElement | null,
  minSiblingHeight: number,
  minPanelHeight: number,
): number {
  if (!container || container.clientHeight <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.max(minPanelHeight, container.clientHeight - minSiblingHeight)
}

export function clampPanelHeight(
  height: number,
  container: HTMLElement | null,
  minHeight: number,
  minSiblingHeight: number,
): number {
  const maxHeight = getMaxPanelHeight(container, minSiblingHeight, minHeight)
  return Math.min(maxHeight, Math.max(minHeight, height))
}

export function readStoredPanelHeight(storageKey: string): number | null {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === null || !Number.isFinite(Number(stored))) {
      return null
    }
    return Number(stored)
  } catch {
    return null
  }
}

export function resolveDefaultPanelHeight(
  container: HTMLElement | null,
  minHeight: number,
  minSiblingHeight: number,
  fallbackHeight: number,
  fraction = DEFAULT_PANEL_HEIGHT_FRACTION,
): number {
  if (container && container.clientHeight > 0) {
    return clampPanelHeight(
      container.clientHeight * fraction,
      container,
      minHeight,
      minSiblingHeight,
    )
  }
  return Math.max(minHeight, fallbackHeight)
}

export function useResizablePanelHeight({
  storageKey,
  defaultHeight = 220,
  defaultHeightFraction = DEFAULT_PANEL_HEIGHT_FRACTION,
  minHeight,
  minSiblingHeight,
  containerRef,
}: ResizablePanelHeightOptions) {
  const [height, setHeight] = useState(() => {
    const stored = readStoredPanelHeight(storageKey)
    if (stored !== null) {
      return Math.max(minHeight, stored)
    }
    return Math.max(minHeight, defaultHeight)
  })

  const clampToContainer = useCallback(() => {
    setHeight((current) =>
      clampPanelHeight(current, containerRef.current, minHeight, minSiblingHeight),
    )
  }, [containerRef, minHeight, minSiblingHeight])

  const applyDefaultFraction = useCallback(() => {
    if (readStoredPanelHeight(storageKey) !== null) {
      return
    }
    const next = resolveDefaultPanelHeight(
      containerRef.current,
      minHeight,
      minSiblingHeight,
      defaultHeight,
      defaultHeightFraction,
    )
    setHeight(next)
  }, [containerRef, defaultHeight, defaultHeightFraction, minHeight, minSiblingHeight, storageKey])

  useEffect(() => {
    applyDefaultFraction()
    clampToContainer()
    window.addEventListener('resize', clampToContainer)
    return () => window.removeEventListener('resize', clampToContainer)
  }, [applyDefaultFraction, clampToContainer])

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const startY = event.clientY
      const startHeight = height
      let latestHeight = startHeight

      const onMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY
        const maxHeight = getMaxPanelHeight(
          containerRef.current,
          minSiblingHeight,
          minHeight,
        )
        const next = Math.min(maxHeight, Math.max(minHeight, startHeight + delta))
        latestHeight = next
        setHeight(next)
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        try {
          localStorage.setItem(storageKey, String(latestHeight))
        } catch {
          // ignore quota errors
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [containerRef, height, minHeight, minSiblingHeight, storageKey],
  )

  return { height, startResize, clampToContainer }
}
