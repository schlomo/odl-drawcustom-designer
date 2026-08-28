import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * TEMPORARY diagnostic overlay for issue #153: a 2-finger gesture failure on
 * a Galaxy Tab S8+ (Chrome/Android) that Chrome DevTools Protocol touch
 * emulation cannot reproduce. Shows the live pointer/touch event stream so
 * the maintainer can FREEZE the log right after a failed gesture and send a
 * screenshot — see the PR's "Touch diagnostics (temporary)" section for the
 * exact workflow.
 *
 * Standalone-only, opt-in via `?touchdebug=1` (read once by the mount helper
 * in `mountTouchDebugOverlay.tsx`, not reactive). Pure window-level
 * instrumentation — no state plumbed into DesignerCanvas, no listeners at
 * all when the query param is absent.
 *
 * REMOVE THIS FILE (or the maintainer explicitly rules "keep") before #153
 * merges — do not let it become permanent product surface.
 */

const MAX_ENTRIES = 25
const PANEL_ATTR = 'data-touch-debug-panel'
const INTEREST_ATTRS = [
  'data-canvas-paper',
  'data-canvas-stage',
  'data-element-slot',
  'data-slot-index',
  'data-element-index',
] as const

interface LogEntry {
  id: number
  text: string
}

function round(n: number): number {
  return Math.round(n)
}

function isDebugPanelTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${PANEL_ATTR}]`) !== null
}

/** tagName + nearest data-* attribute of interest, or 'outside-canvas'. */
function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'non-element'
  const tag = target.tagName.toLowerCase()
  if (!target.closest('[data-canvas-stage]')) return `${tag} outside-canvas`
  const nearest = target.closest(INTEREST_ATTRS.map((attr) => `[${attr}]`).join(','))
  if (!nearest) return `${tag} canvas-stage`
  const attr = INTEREST_ATTRS.find((candidate) => nearest.hasAttribute(candidate))
  return `${tag}[${attr}]`
}

export function TouchDebugOverlay() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [frozen, setFrozen] = useState(false)
  const frozenRef = useRef(frozen)

  const nextId = useRef(0)
  // Impure (performance.now()) — must be set from an effect, not during
  // render (react-hooks/purity forbids reading the clock while rendering).
  const mountedAt = useRef(0)
  const moveCounts = useRef(new Map<number, number>())
  // Same Event instance flows capture -> handlers -> bubble; this links the
  // capture-time log line to its post-handler defaultPrevented reading.
  const pending = useRef(new WeakMap<Event, LogEntry>())

  useEffect(() => {
    frozenRef.current = frozen
  }, [frozen])

  const ts = useCallback(() => (performance.now() - mountedAt.current).toFixed(0).padStart(6, ' '), [])

  const push = useCallback((text: string): LogEntry | null => {
    if (frozenRef.current) return null
    const entry: LogEntry = { id: nextId.current++, text }
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES))
    return entry
  }, [])

  const patch = useCallback((entry: LogEntry, suffix: string) => {
    if (frozenRef.current) return
    entry.text += suffix
    setEntries((prev) => {
      const idx = prev.findIndex((candidate) => candidate.id === entry.id)
      if (idx === -1) return prev
      const copy = prev.slice()
      copy[idx] = { ...entry }
      return copy
    })
  }, [])

  const flushMoves = useCallback(
    (pointerId: number) => {
      const count = moveCounts.current.get(pointerId)
      if (count) {
        push(`${ts()} move    id=${pointerId} …${count} moves`)
      }
      moveCounts.current.delete(pointerId)
    },
    [push, ts],
  )

  useEffect(() => {
    mountedAt.current = performance.now()

    const capture = { capture: true } as const

    const onPointerDown = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      moveCounts.current.delete(e.pointerId)
      const entry = push(
        `${ts()} down    id=${e.pointerId} primary=${e.isPrimary} ${e.pointerType} (${round(e.clientX)},${round(e.clientY)}) ${describeTarget(e.target)}`,
      )
      if (entry) pending.current.set(e, entry)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      flushMoves(e.pointerId)
      const entry = push(
        `${ts()} up      id=${e.pointerId} primary=${e.isPrimary} ${e.pointerType} (${round(e.clientX)},${round(e.clientY)}) ${describeTarget(e.target)}`,
      )
      if (entry) pending.current.set(e, entry)
    }
    const onPointerCancel = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      flushMoves(e.pointerId)
      push(
        `${ts()} cancel  id=${e.pointerId} primary=${e.isPrimary} ${e.pointerType} (${round(e.clientX)},${round(e.clientY)}) ${describeTarget(e.target)}`,
      )
    }
    const onGotCapture = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      push(`${ts()} gotcap  id=${e.pointerId} ${e.pointerType} ${describeTarget(e.target)}`)
    }
    const onLostCapture = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      flushMoves(e.pointerId)
      push(`${ts()} lostcap id=${e.pointerId} ${e.pointerType} ${describeTarget(e.target)}`)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (isDebugPanelTarget(e.target)) return
      moveCounts.current.set(e.pointerId, (moveCounts.current.get(e.pointerId) ?? 0) + 1)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (isDebugPanelTarget(e.target)) return
      const t = e.changedTouches[0]
      const entry = push(
        `${ts()} Tstart  touches=${e.touches.length} ${t ? `(${round(t.clientX)},${round(t.clientY)})` : ''} ${describeTarget(e.target)}`,
      )
      if (entry) pending.current.set(e, entry)
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (isDebugPanelTarget(e.target)) return
      const t = e.changedTouches[0]
      const entry = push(
        `${ts()} Tend    touches=${e.touches.length} ${t ? `(${round(t.clientX)},${round(t.clientY)})` : ''} ${describeTarget(e.target)}`,
      )
      if (entry) pending.current.set(e, entry)
    }
    const onTouchCancel = (e: TouchEvent) => {
      if (isDebugPanelTarget(e.target)) return
      push(`${ts()} Tcancel touches=${e.touches.length} ${describeTarget(e.target)}`)
    }
    // Bubble-phase reading: fires after the target's own React handlers, so
    // by the time it reaches window, any preventDefault() call already
    // happened — labelled "(bubble)" so it's clear this is a post-handler
    // reading, not the (always-false) capture-time value.
    const onBubbleDefaultPrevented = (e: Event) => {
      const entry = pending.current.get(e)
      if (entry) {
        patch(entry, ` dp=${e.defaultPrevented}(bubble)`)
        pending.current.delete(e)
      }
    }

    window.addEventListener('pointerdown', onPointerDown, capture)
    window.addEventListener('pointerup', onPointerUp, capture)
    window.addEventListener('pointercancel', onPointerCancel, capture)
    window.addEventListener('gotpointercapture', onGotCapture, capture)
    window.addEventListener('lostpointercapture', onLostCapture, capture)
    window.addEventListener('pointermove', onPointerMove, capture)
    window.addEventListener('touchstart', onTouchStart, capture)
    window.addEventListener('touchend', onTouchEnd, capture)
    window.addEventListener('touchcancel', onTouchCancel, capture)

    window.addEventListener('pointerdown', onBubbleDefaultPrevented)
    window.addEventListener('pointerup', onBubbleDefaultPrevented)
    window.addEventListener('touchstart', onBubbleDefaultPrevented)
    window.addEventListener('touchend', onBubbleDefaultPrevented)
    window.addEventListener('touchcancel', onBubbleDefaultPrevented)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, capture)
      window.removeEventListener('pointerup', onPointerUp, capture)
      window.removeEventListener('pointercancel', onPointerCancel, capture)
      window.removeEventListener('gotpointercapture', onGotCapture, capture)
      window.removeEventListener('lostpointercapture', onLostCapture, capture)
      window.removeEventListener('pointermove', onPointerMove, capture)
      window.removeEventListener('touchstart', onTouchStart, capture)
      window.removeEventListener('touchend', onTouchEnd, capture)
      window.removeEventListener('touchcancel', onTouchCancel, capture)

      window.removeEventListener('pointerdown', onBubbleDefaultPrevented)
      window.removeEventListener('pointerup', onBubbleDefaultPrevented)
      window.removeEventListener('touchstart', onBubbleDefaultPrevented)
      window.removeEventListener('touchend', onBubbleDefaultPrevented)
      window.removeEventListener('touchcancel', onBubbleDefaultPrevented)
    }
  }, [push, patch, flushMoves, ts])

  return (
    <div
      data-touch-debug-panel
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 14,
        color: '#e5ffe5',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.9)',
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setFrozen((f) => !f)}
          style={{
            minHeight: 44,
            minWidth: 96,
            fontSize: 14,
            fontWeight: 700,
            background: frozen ? '#facc15' : '#16a34a',
            color: '#000',
            border: 'none',
            borderRadius: 4,
          }}
        >
          {frozen ? 'RESUME' : 'FREEZE'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEntries([])
            moveCounts.current.clear()
          }}
          style={{
            minHeight: 44,
            minWidth: 96,
            fontSize: 14,
            fontWeight: 700,
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
          }}
        >
          CLEAR
        </button>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>
          touchdebug {entries.length}/{MAX_ENTRIES} {frozen ? '— FROZEN' : ''}
        </span>
      </div>
      <div
        style={{
          maxHeight: '38vh',
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.9)',
          padding: '4px 8px',
          whiteSpace: 'pre',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>no events yet — gesture on the canvas</div>
        ) : (
          entries.map((entry) => <div key={entry.id}>{entry.text}</div>)
        )}
      </div>
    </div>
  )
}
