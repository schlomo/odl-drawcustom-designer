import { useMemo, useState } from 'react'
import type { DrawElement, HaMockContext } from '../../core'
import { scanPayloadForTemplates } from '../../core'
import { shell } from '../styles/shell'

interface StateSimulatorProps {
  elements: DrawElement[]
  mockContext: HaMockContext
  onSetMockState: (entityId: string, value: string) => void
  onAddEntity: (entityId: string, value: string) => void
  onRemoveEntity: (entityId: string) => void
}

function formatMockValue(value: string | number | boolean): string {
  return String(value)
}

export function StateSimulator({
  elements,
  mockContext,
  onSetMockState,
  onAddEntity,
  onRemoveEntity,
}: StateSimulatorProps) {
  const [newEntityId, setNewEntityId] = useState('')
  const [newEntityValue, setNewEntityValue] = useState('')

  const scannedIds = useMemo(
    () => new Set(scanPayloadForTemplates(elements).entityIds),
    [elements],
  )

  const entityRows = useMemo(() => {
    return Object.keys(mockContext.states)
      .sort()
      .map((entityId) => ({
        entityId,
        value: mockContext.states[entityId],
        referenced: scannedIds.has(entityId),
      }))
  }, [mockContext.states, scannedIds])

  const handleAddEntity = () => {
    const trimmedId = newEntityId.trim()
    if (!trimmedId) {
      return
    }
    onAddEntity(trimmedId, newEntityValue.trim() || 'unknown')
    setNewEntityId('')
    setNewEntityValue('')
  }

  return (
    <section className={`border-b ${shell.panelBorder} p-4`}>
      <h2 className={shell.heading}>State simulator</h2>
      <p className={`mt-1 text-xs ${shell.muted}`}>
        Mock Home Assistant entity states for template preview.
      </p>

      {entityRows.length === 0 ? (
        <p className={`mt-3 text-xs ${shell.muted}`}>
          No entities yet. Add one below or use templates in YAML.
        </p>
      ) : (
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
          {entityRows.map((row) => (
            <li key={row.entityId} className="grid grid-cols-[1fr_minmax(0,5rem)_auto] gap-1">
              <span
                className={`truncate font-mono text-[11px] ${row.referenced ? 'text-[var(--shell-text)]' : shell.muted}`}
                title={row.entityId}
              >
                {row.entityId}
                {!row.referenced ? ' · manual' : ''}
              </span>
              <input
                type="text"
                className={`${shell.input} px-1.5 py-1 text-[11px]`}
                value={formatMockValue(row.value)}
                onChange={(event) => onSetMockState(row.entityId, event.target.value)}
                aria-label={`Mock state for ${row.entityId}`}
              />
              {!row.referenced ? (
                <button
                  type="button"
                  className={`${shell.button} px-1.5`}
                  aria-label={`Remove ${row.entityId}`}
                  onClick={() => onRemoveEntity(row.entityId)}
                >
                  ×
                </button>
              ) : (
                <span aria-hidden="true" className="w-7" />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-1">
        <p className={`text-[10px] uppercase tracking-wide ${shell.muted}`}>Add entity</p>
        <div className="grid grid-cols-[1fr_minmax(0,4rem)_auto] gap-1">
          <input
            type="text"
            className={`${shell.input} px-1.5 py-1 text-[11px]`}
            placeholder="sensor.example"
            value={newEntityId}
            onChange={(event) => setNewEntityId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAddEntity()
              }
            }}
          />
          <input
            type="text"
            className={`${shell.input} px-1.5 py-1 text-[11px]`}
            placeholder="value"
            value={newEntityValue}
            onChange={(event) => setNewEntityValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAddEntity()
              }
            }}
          />
          <button type="button" className={shell.button} onClick={handleAddEntity}>
            Add
          </button>
        </div>
      </div>
    </section>
  )
}
