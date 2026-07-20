import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TOOLBAR_TOOLTIP_SHOW_DELAY_MS } from '../lib/toolbar-tooltip'

interface ToolbarTooltipProps {
  label: string
  children: ReactNode
  /**
   * Horizontal anchor for the bubble: `center` over the button, or `end` to
   * align its right edge with the button's — for buttons at the right edge of
   * a clipping container (e.g. the property panel), where a centered bubble
   * would stick out past the container.
   */
  align?: 'center' | 'end'
}

/**
 * Hover tooltip for toolbar icon buttons.
 * Mouse-driven visibility avoids CSS `focus-within` leaving prior tooltips stuck
 * when moving between adjacent controls. Native `title` remains on the button.
 */
export function ToolbarTooltip({ label, children, align = 'center' }: ToolbarTooltipProps) {
  const [visible, setVisible] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearShowTimer()
    setVisible(false)
  }, [clearShowTimer])

  const showAfterDelay = useCallback(() => {
    clearShowTimer()
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = null
      setVisible(true)
    }, TOOLBAR_TOOLTIP_SHOW_DELAY_MS)
  }, [clearShowTimer])

  useEffect(() => hide, [hide])

  return (
    <span
      className="relative inline-flex shrink-0 [&_button:disabled]:pointer-events-none"
      onMouseEnter={showAfterDelay}
      onMouseLeave={hide}
    >
      {children}
      {/* Hidden state must be `display: none` — a merely invisible nowrap
          bubble keeps its layout box and inflates the scrollable overflow of
          ancestor scrollers (issue #83: permanent horizontal scrollbar on the
          property panel from the hidden template-toggle tooltips). */}
      <span
        role="tooltip"
        aria-hidden={!visible}
        className={`pointer-events-none absolute bottom-[calc(100%+6px)] z-50 whitespace-nowrap rounded-md border border-[var(--shell-border)] bg-[var(--shell-text)] px-2 py-1 text-xs text-[var(--shell-surface)] shadow-md ${
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'
        } ${visible ? 'visible' : 'hidden'}`}
      >
        {label}
      </span>
    </span>
  )
}
