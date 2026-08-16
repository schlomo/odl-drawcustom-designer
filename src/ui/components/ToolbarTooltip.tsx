import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TOOLBAR_TOOLTIP_SHOW_DELAY_MS } from '../lib/toolbar-tooltip'

interface ToolbarTooltipProps {
  /**
   * Bubble text. Absent or empty renders the wrapper **without** a bubble, so
   * a caller whose label comes and goes (a host action's `disabledReason`,
   * issue #108) can render this component unconditionally: swapping the
   * element type instead remounts the wrapped button and drops its keyboard
   * focus mid-interaction.
   */
  label?: string
  children: ReactNode
  /**
   * Horizontal anchor for the bubble: `center` over the button, or `end` to
   * align its right edge with the button's — for buttons at the right edge of
   * a clipping container (e.g. the property panel), where a centered bubble
   * would stick out past the container.
   */
  align?: 'center' | 'end'
  /**
   * Vertical anchor: `above` (default) pops the bubble over the button,
   * `below` pops it underneath. Use `below` for a button flush against the
   * top of a clipped `overflow-hidden` container (e.g. the sidebar's display
   * lock) — an `above` bubble has no room and gets clipped by the container's
   * own top edge (issue #70 review).
   */
  placement?: 'above' | 'below'
}

/**
 * Hover tooltip for toolbar icon buttons.
 * Mouse-driven visibility avoids CSS `focus-within` leaving prior tooltips stuck
 * when moving between adjacent controls. Native `title` remains on the button.
 */
export function ToolbarTooltip({
  label,
  children,
  align = 'center',
  placement = 'above',
}: ToolbarTooltipProps) {
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
      {label ? (
        <span
          role="tooltip"
          aria-hidden={!visible}
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-[var(--shell-border)] bg-[var(--shell-text)] px-2 py-1 text-xs text-[var(--shell-surface)] shadow-md ${
            placement === 'below' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
          } ${align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${
            visible ? 'visible' : 'hidden'
          }`}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}
