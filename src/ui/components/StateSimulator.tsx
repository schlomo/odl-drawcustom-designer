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
  embedded?: boolean
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
  embedded = false,
}: StateSimulatorProps) {
  const [draftEntityId, setDraftEntityId] = useState('')
  const [draftEntityValue, setDraftEntityValue] = useState('')

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

  const commitDraftEntity = () => {
    const trimmedId = draftEntityId.trim()
    if (!trimmedId) {
      return
    }
    onAddEntity(trimmedId, draftEntityValue.trim() || 'unknown')
    setDraftEntityId('')
    setDraftEntityValue('')
  }

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'flex min-h-0 flex-1 flex-col'
    : `border-b ${shell.panelBorder} p-4`
  const entityGridClassName =
    'grid grid-cols-[minmax(0,1fr)_5rem_1.75rem] items-center gap-x-1 gap-y-1.5'
  const listClassName = embedded
    ? entityGridClassName
    : `mt-3 max-h-40 overflow-y-auto ${entityGridClassName}`
  const listScrollClassName = embedded ? 'mt-2 min-h-0 flex-1 overflow-y-auto' : undefined

  const entityList = (
    <ul className={listClassName}>
      {entityRows.map((row) => (
        <li key={row.entityId} className="contents">
          <span
            className={`truncate font-mono text-[11px] ${row.referenced ? 'text-[var(--shell-text)]' : shell.muted}`}
            title={row.entityId}
          >
            {row.entityId}
            {!row.referenced ? ' · manual' : ''}
          </span>
          <input
            type="text"
            className={`${shell.input} w-full px-1.5 py-1 text-[11px]`}
            value={formatMockValue(row.value)}
            onChange={(event) => onSetMockState(row.entityId, event.target.value)}
            aria-label={`Mock state for ${row.entityId}`}
          />
          {!row.referenced ? (
            <button
              type="button"
              className={`${shell.button} w-full px-0`}
              aria-label={`Remove ${row.entityId}`}
              onClick={() => onRemoveEntity(row.entityId)}
            >
              ×
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </li>
      ))}
      <li className="contents">
        <input
          type="text"
          className={`${shell.input} w-full px-1.5 py-1 font-mono text-[11px]`}
          placeholder="sensor.example"
          value={draftEntityId}
          onChange={(event) => setDraftEntityId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitDraftEntity()
            }
          }}
          aria-label="New entity id"
        />
        <input
          type="text"
          className={`${shell.input} w-full px-1.5 py-1 text-[11px]`}
          placeholder="value"
          value={draftEntityValue}
          onChange={(event) => setDraftEntityValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitDraftEntity()
            }
          }}
          aria-label="New entity value"
        />
        <span aria-hidden="true" />
      </li>
    </ul>
  )

  return (
    <Wrapper className={wrapperClass}>
      <div className={embedded ? 'shrink-0' : undefined}>
        {!embedded ? <h2 className={shell.heading}>State simulator</h2> : null}
        <p className={`${embedded ? '' : 'mt-1'} text-xs ${shell.muted}`}>
          Mock Home Assistant entity states for template preview.
        </p>
      </div>

      {embedded ? <div className={listScrollClassName}>{entityList}</div> : entityList}
    </Wrapper>
  )
}
