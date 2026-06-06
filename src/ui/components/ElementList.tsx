import { useCallback, useState, type DragEvent } from 'react'
import type { DrawElement } from '../../core'
import { layerPanelDisplayOrder } from '../lib/draw-order'
import { shell } from '../styles/shell'

interface ElementListProps {
  elements: DrawElement[]
  selectedIndex: number | null
  onSelectElement: (index: number) => void
  onReorderElement: (fromIndex: number, toIndex: number) => void
}

function elementLabel(element: DrawElement, index: number): string {
  const typeLabel = element.type.replace(/_/g, ' ')
  return `${index + 1}. ${typeLabel}`
}

export function ElementList({
  elements,
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
      {elements.length === 0 ? (
        <li className={`text-xs ${shell.muted}`}>No elements yet</li>
      ) : (
        layerPanelDisplayOrder(elements).map(({ item: element, index }) => (
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
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                selectedIndex === index
                  ? 'bg-[var(--shell-accent)] text-white'
                  : 'bg-[var(--shell-surface-2)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]'
              } ${dragIndex === index ? 'opacity-50' : ''}`}
              onClick={() => onSelectElement(index)}
            >
              <span aria-hidden className="mr-2 cursor-grab opacity-60">
                ⠿
              </span>
              {elementLabel(element, index)}
            </button>
          </li>
        ))
      )}
    </ul>
  )
}
