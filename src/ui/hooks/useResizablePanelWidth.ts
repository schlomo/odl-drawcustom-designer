import { useCallback, useState } from 'react'

interface ResizablePanelWidthOptions {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export function useResizablePanelWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: ResizablePanelWidthOptions) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth),
  )

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      let latestWidth = startWidth

      const onMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX
        const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta))
        latestWidth = next
        setWidth(next)
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        try {
          localStorage.setItem(storageKey, String(latestWidth))
        } catch {
          // ignore quota errors
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [maxWidth, minWidth, storageKey, width],
  )

  return { width, startResize }
}

function readStoredWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  try {
    const stored = localStorage.getItem(storageKey)
    const base = stored && Number.isFinite(Number(stored)) ? Number(stored) : defaultWidth
    return Math.min(maxWidth, Math.max(minWidth, base))
  } catch {
    return Math.min(maxWidth, Math.max(minWidth, defaultWidth))
  }
}
