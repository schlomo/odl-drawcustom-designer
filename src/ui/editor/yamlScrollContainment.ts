import type { Extension } from '@codemirror/state'
import { Direction, EditorView } from '@codemirror/view'

/** Mirror of CodeMirror's unexported `ScrollStrategy`. */
export type ScrollStrategy = 'nearest' | 'start' | 'end' | 'center'

export interface ScrollRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ContainedScrollMove {
  moveX: number
  moveY: number
}

/**
 * How far a single scroller must move so `rect` satisfies the x/y scroll
 * strategy inside `bounding` — a faithful port of the per-scroller math in
 * CodeMirror's `scrollRectIntoView` (@codemirror/view, dom.ts), minus the
 * ancestor walk. Whatever the scroller cannot absorb is deliberately
 * discarded instead of being handed to parent scrollers or the window.
 */
export function computeContainedScrollMove(
  rect: ScrollRect,
  bounding: ScrollRect,
  side: -1 | 1,
  x: ScrollStrategy,
  y: ScrollStrategy,
  xMargin: number,
  yMargin: number,
  ltr: boolean,
): ContainedScrollMove {
  let moveX = 0
  let moveY = 0

  if (y === 'nearest') {
    if (rect.top < bounding.top + yMargin) {
      moveY = rect.top - (bounding.top + yMargin)
      if (side > 0 && rect.bottom > bounding.bottom + moveY) {
        moveY = rect.bottom - bounding.bottom + yMargin
      }
    } else if (rect.bottom > bounding.bottom - yMargin) {
      moveY = rect.bottom - bounding.bottom + yMargin
      if (side < 0 && rect.top - moveY < bounding.top) {
        moveY = rect.top - (bounding.top + yMargin)
      }
    }
  } else {
    const rectHeight = rect.bottom - rect.top
    const boundingHeight = bounding.bottom - bounding.top
    const targetTop =
      y === 'center' && rectHeight <= boundingHeight
        ? rect.top + rectHeight / 2 - boundingHeight / 2
        : y === 'start' || (y === 'center' && side < 0)
          ? rect.top - yMargin
          : rect.bottom - boundingHeight + yMargin
    moveY = targetTop - bounding.top
  }

  if (x === 'nearest') {
    if (rect.left < bounding.left + xMargin) {
      moveX = rect.left - (bounding.left + xMargin)
      if (side > 0 && rect.right > bounding.right + moveX) {
        moveX = rect.right - bounding.right + xMargin
      }
    } else if (rect.right > bounding.right - xMargin) {
      moveX = rect.right - bounding.right + xMargin
      if (side < 0 && rect.left < bounding.left + moveX) {
        moveX = rect.left - (bounding.left + xMargin)
      }
    }
  } else {
    const targetLeft =
      x === 'center'
        ? rect.left + (rect.right - rect.left) / 2 - (bounding.right - bounding.left) / 2
        : (x === 'start') === ltr
          ? rect.left - xMargin
          : rect.right - (bounding.right - bounding.left) + xMargin
    moveX = targetLeft - bounding.left
  }

  return { moveX, moveY }
}

function clampMargin(margin: number, size: number): number {
  return Math.max(Math.min(margin, size), -size)
}

/**
 * Contain every editor scroll-into-view inside the editor's own scroller
 * (issue #79). CodeMirror's default handling walks ancestor scrollers past
 * the editor — in embed mode that reaches the HOST document and calls
 * `window.scrollBy` whenever the target line cannot be fully positioned
 * inside the editor (e.g. the Linked-editor `y: 'center'` scroll near the
 * document end). A host page embedding the designer above other content
 * would visibly jump on every canvas selection.
 *
 * This `EditorView.scrollHandler` replays CodeMirror's own geometry against
 * `view.scrollDOM` only and returns `true`, so the default ancestor walk
 * never runs. In-editor behavior is unchanged: the scroller still moves by
 * exactly the amount CodeMirror would have moved it (browser-clamped at the
 * scroller's own edges).
 *
 * Scroll handlers are invoked while the view is mid-update, where CodeMirror
 * forbids layout reads ("Reading the editor layout isn't allowed during an
 * update" — `coordsAtPos` throws). The geometry is therefore deferred into a
 * `requestMeasure` read phase, which the measure loop runs in the same
 * frame; the keyed request keeps a rapid burst of scroll targets collapsed
 * to the latest one.
 *
 * Not ported from the original: CSS-transform scale compensation (the
 * editor pane is never scaled — only the canvas paper is) and the
 * `EditorView.scrollMargins` facet (unused in this app).
 */
export function yamlScrollContainment(): Extension {
  return EditorView.scrollHandler.of((view, range, options) => {
    const { x, y, xMargin, yMargin } = options
    view.requestMeasure<ContainedScrollMove | null>({
      key: 'yaml-scroll-containment (#79)',
      read(v): ContainedScrollMove | null {
        // The doc may have changed between the scroll request and this
        // measure pass — a stale out-of-range position must not throw.
        if (range.head > v.state.doc.length || range.anchor > v.state.doc.length) {
          return null
        }

        const head = v.coordsAtPos(range.head, range.head > range.anchor ? -1 : 1)
        if (!head) {
          // Nothing measurable (position not rendered): drop the request —
          // CodeMirror's default path would not scroll here either.
          return null
        }

        let rect: ScrollRect = head
        if (!range.empty) {
          const anchor = v.coordsAtPos(range.anchor, range.anchor > range.head ? -1 : 1)
          if (anchor) {
            rect = {
              left: Math.min(rect.left, anchor.left),
              top: Math.min(rect.top, anchor.top),
              right: Math.max(rect.right, anchor.right),
              bottom: Math.max(rect.bottom, anchor.bottom),
            }
          }
        }

        const scroller = v.scrollDOM
        const scrollerRect = scroller.getBoundingClientRect()
        // client sizes exclude the scrollbars, like CodeMirror's own bounding.
        const bounding: ScrollRect = {
          left: scrollerRect.left,
          top: scrollerRect.top,
          right: scrollerRect.left + scroller.clientWidth,
          bottom: scrollerRect.top + scroller.clientHeight,
        }

        return computeContainedScrollMove(
          rect,
          bounding,
          range.head < range.anchor ? -1 : 1,
          x,
          y,
          clampMargin(xMargin, scroller.offsetWidth),
          clampMargin(yMargin, scroller.offsetHeight),
          v.textDirection === Direction.LTR,
        )
      },
      write(move, v) {
        if (!move) {
          return
        }
        if (move.moveY) {
          v.scrollDOM.scrollTop += move.moveY
        }
        if (move.moveX) {
          v.scrollDOM.scrollLeft += move.moveX
        }
      },
    })
    return true
  })
}
