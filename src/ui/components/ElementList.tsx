import { useCallback, useState, type DragEvent } from 'react'
import type { DrawElement } from '../../core'
import { layerPanelDisplayOrder } from '../lib/draw-order'
import { elementListRowMeta } from '../lib/element-list-row'
import { ElementListThumbnail } from './ElementListThumbnail'

interface ElementListProps {
  /** Template-evaluated elements for row labels and thumbnails. */
  previewElements: DrawElement[]
  selectedIndex: number | null
  onSelectElement: (index: number) => void
  onReorderElement: (fromIndex: number, toIndex: number) => void
}

export function ElementList({
  previewElements,
  selectedIndex,
  onSelectElement,
  onReorderElement,
}: ElementListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((event: DragEvent<HTMLButtonElement>, index: number) => {
    setDragIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, index: number) => {
      event.preventDefault()
      const fromIndex = dragIndex ?? Number(event.dataTransfer.getData('text/plain'))
      if (Number.isInteger(fromIndex) && fromIndex !== index) {
        onReorderElement(fromIndex, index)
      }
      setDragIndex(null)
      setDropIndex(null)
    },
    [dragIndex, onReorderElement],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  return (
    <ul className="space-y-1 overflow-y-auto">
      {previewElements.length === 0 ? (
        <li className="text-xs text-[var(--shell-muted)]">No elements yet</li>
      ) : (
        layerPanelDisplayOrder(previewElements).map(({ item: element, index }) => {
          const selected = selectedIndex === index
          const row = elementListRowMeta(element)
          return (
          <li
            key={`${index}-${element.type}`}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={(event) => handleDrop(event, index)}
            className={
              dropIndex === index && dragIndex !== index
                ? 'rounded-md ring-2 ring-[var(--shell-accent)]'
                : undefined
            }
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
              } ${dragIndex === index ? 'opacity-50' : ''}`}
              onClick={() => onSelectElement(index)}
            >
              <span aria-hidden className="cursor-grab opacity-60">
                ⠿
              </span>
              <ElementListThumbnail thumbnail={row.thumbnail} selected={selected} />
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
