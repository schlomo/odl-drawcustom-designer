import { useEffect, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

const ZERO_SIZE: ElementSize = { width: 0, height: 0 }

/** Observe an element's content box; re-runs when the YAML divider or window resizes the slot. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(ZERO_SIZE)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const update = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
