import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react'
import type { DrawElement, PaletteOverrides, TagColorMode } from '../../core'
import { layerPanelDisplayOrder } from '../lib/draw-order'
import {
  elementListDragIndices,
  normalizeElementListDropIndex,
} from '../lib/element-list-drag'
import { primaryElementListIndex, shouldScrollListRow } from '../lib/element-list-scroll'
import { elementHasColorClampLoss } from '../lib/color-clamp-status-messages'
import { elementListRowMeta } from '../lib/element-list-row'
import { statusRowClassName } from '../lib/status-styles'
import type { PreviewDitherMode } from '../preferences/displayConfig'
import { mdiDragVertical } from '@mdi/js'
import { MdiIcon } from './MdiIcon'
import { ElementListThumbnail } from './ElementListThumbnail'

import type { SelectElementOptions } from '../hooks/useProjectState'

interface ElementListProps {
  /** Template-evaluated elements for row labels and thumbnails. */
  previewElements: DrawElement[]
  selectedIndices: number[]
  colorMode: TagColorMode
  previewDitherMode?: PreviewDitherMode
  /** Measured palette hexes (issue #68) — swatch fills adopt them. */
  paletteOverrides?: PaletteOverrides
  onSelectElement: (index: number, options?: SelectElementOptions) => void
  onReorderElement: (
    fromIndex: number,
    toIndex: number,
    movingIndices?: readonly number[],
  ) => void
  /** Issue #35: no element mutation while the YAML doc is blocked — disables drag-reorder (row click still selects). */
  blocked?: boolean
}

export function ElementList({
  previewElements,
  selectedIndices,
  colorMode,
  previewDitherMode = 0,
  paletteOverrides,
  onSelectElement,
  onReorderElement,
  blocked = false,
}: ElementListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [movingIndices, setMovingIndices] = useState<number[]>([])
  const didDragRef = useRef(false)
  const rowRefs = useRef(new Map<number, HTMLButtonElement>())

  const setRowRef = useCallback((index: number, node: HTMLButtonElement | null) => {
    if (node) {
      rowRefs.current.set(index, node)
    } else {
      rowRefs.current.delete(index)
    }
  }, [])

  const previousSelectedIndicesRef = useRef<readonly number[]>([])

  // Scroll the selected row into view on a selection change (canvas click,
  // YAML cursor move, keyboard nav — anything that changes `selectedIndices`
  // upstream). The target is derived by diffing against the previous
  // selection because `selectedIndices` is numerically sorted, not
  // selection-ordered (see primaryElementListIndex). `block: 'nearest'`
  // makes an already-visible row a zero-movement no-op. Selection
  // highlighting already ignores the YAML coupling toggle (rows highlight
  // from `selectedIndices` unconditionally), so this mirrors that: it is
  // not gated on `useYamlSelectionCoupling`.
  useEffect(() => {
    const previous = previousSelectedIndicesRef.current
    previousSelectedIndicesRef.current = selectedIndices
    const targetIndex = primaryElementListIndex(previous, selectedIndices)
    if (!shouldScrollListRow(targetIndex, dragIndex)) {
      return
    }
    const row = rowRefs.current.get(targetIndex!)
    if (typeof row?.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
    // dragIndex is deliberately not a dep: only an actual selection change
    // should trigger a scroll attempt; a drag starting or ending must not
    // itself re-fire this effect — it only gates whether an already-
    // triggered selection change is honored (mirrors the YAML-pane scroll
    // wiring's use of refs for signals that must not retrigger the effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndices])

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, index: number) => {
      didDragRef.current = true
      const nextMovingIndices = elementListDragIndices(index, selectedIndices)
      setMovingIndices(nextMovingIndices)
      setDragIndex(index)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    },
    [selectedIndices],
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, index: number) => {
      event.preventDefault()
      const fromIndex = dragIndex ?? Number(event.dataTransfer.getData('text/plain'))
      const dropTarget = normalizeElementListDropIndex(fromIndex, index, movingIndices)
      if (!blocked && Number.isInteger(fromIndex) && dropTarget != null) {
        onReorderElement(fromIndex, dropTarget, movingIndices)
      }
      setDragIndex(null)
      setDropIndex(null)
      setMovingIndices([])
    },
    [blocked, dragIndex, movingIndices, onReorderElement],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
    setMovingIndices([])
  }, [])

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, index: number) => {
      if (didDragRef.current) {
        didDragRef.current = false
        return
      }
      onSelectElement(index, { additive: event.shiftKey || event.metaKey || event.ctrlKey })
    },
    [onSelectElement],
  )

  const clampedElements = useMemo(() => {
    const clamped = new Set<number>()
    previewElements.forEach((element, index) => {
      if (elementHasColorClampLoss(element, colorMode, previewDitherMode)) {
        clamped.add(index)
      }
    })
    return clamped
  }, [previewElements, colorMode, previewDitherMode])

  return (
    <ul className="space-y-1 overflow-y-auto">
      {previewElements.length === 0 ? (
        <li className="text-xs text-[var(--shell-muted)]">No elements yet</li>
      ) : (
        layerPanelDisplayOrder(previewElements).map(({ item: element, index }) => {
          const selected = selectedIndices.includes(index)
          const draggingBlock = dragIndex != null ? movingIndices : []
          const row = elementListRowMeta(element, paletteOverrides)
          const colorClamped = clampedElements.has(index)
          const dropActive =
            dropIndex === index &&
            dragIndex != null &&
            normalizeElementListDropIndex(dragIndex, index, movingIndices) != null
          return (
          <li
            key={`${index}-${element.type}`}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={(event) => handleDrop(event, index)}
            className={dropActive ? 'rounded-md ring-2 ring-[var(--shell-accent)]' : undefined}
          >
            <button
              type="button"
              ref={(node) => setRowRef(index, node)}
              draggable={!blocked}
              aria-pressed={selected}
              data-testid="element-list-row"
              onDragStart={(event) => handleDragStart(event, index)}
              onDragEnd={handleDragEnd}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                selected
                  ? 'bg-[var(--shell-accent)] text-white'
                  : colorClamped
                    ? statusRowClassName('warning')
                    : 'bg-[var(--shell-surface-2)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]'
              } ${draggingBlock.includes(index) ? 'opacity-50' : ''}`}
              onClick={(event) => handleRowClick(event, index)}
            >
              <span aria-hidden className="cursor-grab opacity-60">
                <MdiIcon path={mdiDragVertical} size={16} />
              </span>
              <ElementListThumbnail
                thumbnail={row.thumbnail}
                selected={selected}
                hiddenOnTag={row.hiddenOnTag}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="shrink-0 font-medium">{row.typeLabel}</span>
                {row.detail ? (
                  <>
                    <span className={`shrink-0 ${selected ? 'text-white/50' : 'text-[var(--shell-muted)]'}`}>
                      ·
                    </span>
                    <span
                      className={`min-w-0 truncate ${selected ? 'text-white/90' : 'text-[var(--shell-muted)]'}`}
                    >
                      {row.detail}
                    </span>
                  </>
                ) : null}
              </span>
            </button>
          </li>
          )
        })
      )}
    </ul>
  )
}
