import { useCallback, useEffect, useState, type RefObject } from 'react'

export const MIN_CANVAS_PREVIEW_HEIGHT = 72

interface ResizablePanelHeightOptions {
  storageKey: string
  defaultHeight: number
  minHeight: number
  minSiblingHeight: number
  containerRef: RefObject<HTMLElement | null>
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

export function useResizablePanelHeight({
  storageKey,
  defaultHeight,
  minHeight,
  minSiblingHeight,
  containerRef,
}: ResizablePanelHeightOptions) {
  const [height, setHeight] = useState(() => readStoredHeight(storageKey, defaultHeight, minHeight))

  const clampToContainer = useCallback(() => {
    setHeight((current) =>
      clampPanelHeight(current, containerRef.current, minHeight, minSiblingHeight),
    )
  }, [containerRef, minHeight, minSiblingHeight])

  useEffect(() => {
    clampToContainer()
    window.addEventListener('resize', clampToContainer)
    return () => window.removeEventListener('resize', clampToContainer)
  }, [clampToContainer])

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

function readStoredHeight(storageKey: string, defaultHeight: number, minHeight: number): number {
  try {
    const stored = localStorage.getItem(storageKey)
    const base = stored && Number.isFinite(Number(stored)) ? Number(stored) : defaultHeight
    return Math.max(minHeight, base)
  } catch {
    return Math.max(minHeight, defaultHeight)
  }
}
