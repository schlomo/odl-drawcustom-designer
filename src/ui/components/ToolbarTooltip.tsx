import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TOOLBAR_TOOLTIP_SHOW_DELAY_MS } from '../lib/toolbar-tooltip'

interface ToolbarTooltipProps {
  label: string
  children: ReactNode
}

/**
 * Hover tooltip for toolbar icon buttons.
 * Mouse-driven visibility avoids CSS `focus-within` leaving prior tooltips stuck
 * when moving between adjacent controls. Native `title` remains on the button.
 */
export function ToolbarTooltip({ label, children }: ToolbarTooltipProps) {
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
      <span
        role="tooltip"
        aria-hidden={!visible}
        className={`pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--shell-border)] bg-[var(--shell-text)] px-2 py-1 text-xs text-[var(--shell-surface)] shadow-md transition-opacity duration-75 ${
          visible ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        {label}
      </span>
    </span>
  )
}
