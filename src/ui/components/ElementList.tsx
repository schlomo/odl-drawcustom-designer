import { useCallback, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { DrawElement } from '../../core'
import { layerPanelDisplayOrder } from '../lib/draw-order'
import {
  elementListDragIndices,
  normalizeElementListDropIndex,
} from '../lib/element-list-drag'
import { elementListRowMeta } from '../lib/element-list-row'
import { mdiDragVertical } from '@mdi/js'
import { MdiIcon } from './MdiIcon'
import { ElementListThumbnail } from './ElementListThumbnail'

import type { SelectElementOptions } from '../hooks/useProjectState'

interface ElementListProps {
  /** Template-evaluated elements for row labels and thumbnails. */
  previewElements: DrawElement[]
  selectedIndices: number[]
  onSelectElement: (index: number, options?: SelectElementOptions) => void
  onReorderElement: (
    fromIndex: number,
    toIndex: number,
    movingIndices?: readonly number[],
  ) => void
}

export function ElementList({
  previewElements,
  selectedIndices,
  onSelectElement,
  onReorderElement,
}: ElementListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [movingIndices, setMovingIndices] = useState<number[]>([])
  const didDragRef = useRef(false)

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
      if (Number.isInteger(fromIndex) && dropTarget != null) {
        onReorderElement(fromIndex, dropTarget, movingIndices)
      }
      setDragIndex(null)
      setDropIndex(null)
      setMovingIndices([])
    },
    [dragIndex, movingIndices, onReorderElement],
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

  return (
    <ul className="space-y-1 overflow-y-auto">
      {previewElements.length === 0 ? (
        <li className="text-xs text-[var(--shell-muted)]">No elements yet</li>
      ) : (
        layerPanelDisplayOrder(previewElements).map(({ item: element, index }) => {
          const selected = selectedIndices.includes(index)
          const draggingBlock = dragIndex != null ? movingIndices : []
          const row = elementListRowMeta(element)
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
              draggable
              onDragStart={(event) => handleDragStart(event, index)}
              onDragEnd={handleDragEnd}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                selected
                  ? 'bg-[var(--shell-accent)] text-white'
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
