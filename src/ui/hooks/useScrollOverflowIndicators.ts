import { useEffect, useRef, useState } from 'react'

export interface ScrollOverflowState {
  /** Content is scrolled down — there is more above the fold. */
  top: boolean
  /** There is more content below the fold. */
  bottom: boolean
}

/**
 * Tracks whether a vertical scroller has undisplayed content above/below the
 * fold (issue #84 — overflow affordance). Attach `scrollerRef` to the
 * `overflow-y-auto` element and `contentRef` to its single content wrapper;
 * a scroll listener catches position changes and one ResizeObserver on both
 * nodes catches viewport and content size changes (selection swaps, template
 * editors expanding). Pure DOM measurement — works inside a shadow root.
 *
 * `active` marks renders that actually mount the scroller (e.g. an element is
 * selected): the effect re-runs on its flips, so the listeners attach when
 * the panel switches from its empty placeholder to the form and detach when
 * it switches back.
 */
export function useScrollOverflowIndicators(active: boolean) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<ScrollOverflowState>({ top: false, bottom: false })

  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!active || !scroller || !content) {
      return
    }

    const update = () => {
      // 1px tolerance absorbs fractional scroll positions at zoomed DPIs.
      const top = scroller.scrollTop > 1
      const bottom = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
      setState((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    }

    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    observer.observe(content)

    return () => {
      scroller.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [active])

  return { scrollerRef, contentRef, ...state }
}
