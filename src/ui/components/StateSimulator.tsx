import { useMemo, useState } from 'react'
import type { DrawElement, HaMockContext } from '../../core'
import { scanPayloadForTemplates } from '../../core'
import { shell } from '../styles/shell'
import { PanelScopeToggle, type PanelListScope } from './PanelScopeToggle'

interface StateSimulatorProps {
  elements: DrawElement[]
  mockContext: HaMockContext
  scope: PanelListScope
  onScopeChange: (scope: PanelListScope) => void
  onSetMockState: (entityId: string, value: string) => void
  onAddEntity: (entityId: string, value: string) => void
  onRemoveEntity: (entityId: string) => void
  onSetMockAttribute?: (entityId: string, attribute: string, value: unknown) => void
  onRenameMockAttribute?: (entityId: string, previousName: string, nextName: string) => void
  onRemoveMockAttribute?: (entityId: string, attribute: string) => void
  onFocusEntity?: (entityId: string) => void
  embedded?: boolean
}

function formatMockValue(value: string | number | boolean): string {
  return String(value)
}

function formatAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  return JSON.stringify(value)
}

/** Coerce a typed attribute value so booleans/numbers behave like HA (not strings). */
function coerceAttributeValue(raw: string): string | number | boolean {
  const trimmed = raw.trim()
  if (trimmed === 'true') {
    return true
  }
  if (trimmed === 'false') {
    return false
  }
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
    return Number(trimmed)
  }
  return raw
}

export function StateSimulator({
  elements,
  mockContext,
  scope,
  onScopeChange,
  onSetMockState,
  onAddEntity,
  onRemoveEntity,
  onSetMockAttribute,
  onRenameMockAttribute,
  onRemoveMockAttribute,
  onFocusEntity,
  embedded = false,
}: StateSimulatorProps) {
  const [draftEntityId, setDraftEntityId] = useState('')
  const [draftEntityValue, setDraftEntityValue] = useState('')
  const [attributeDrafts, setAttributeDrafts] = useState<Record<string, { name: string; value: string }>>(
    {},
  )

  const scannedIds = useMemo(
    () => new Set(scanPayloadForTemplates(elements).entityIds),
    [elements],
  )

  const attributesByEntity = mockContext.attributes ?? {}

  const entityRows = useMemo(() => {
    return Object.keys(mockContext.states)
      .sort()
      .map((entityId) => ({
        entityId,
        value: mockContext.states[entityId],
        referenced: scannedIds.has(entityId),
      }))
      .filter((row) => scope === 'all' || row.referenced)
  }, [mockContext.states, scannedIds, scope])

  const commitDraftEntity = () => {
    const trimmedId = draftEntityId.trim()
    if (!trimmedId) {
      return
    }
    onAddEntity(trimmedId, draftEntityValue.trim() || 'unknown')
    setDraftEntityId('')
    setDraftEntityValue('')
  }

  const getAttributeDraft = (entityId: string) =>
    attributeDrafts[entityId] ?? { name: '', value: '' }

  const setAttributeDraft = (entityId: string, draft: { name: string; value: string }) => {
    setAttributeDrafts((current) => ({ ...current, [entityId]: draft }))
  }

  const commitAttributeDraft = (entityId: string) => {
    const draft = getAttributeDraft(entityId)
    const name = draft.name.trim()
    if (!name || !onSetMockAttribute) {
      return
    }
    onSetMockAttribute(entityId, name, coerceAttributeValue(draft.value))
    setAttributeDraft(entityId, { name: '', value: '' })
  }

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'flex min-h-0 flex-1 flex-col'
    : `border-b ${shell.panelBorder} p-4`
  const listScrollClassName = embedded
    ? 'mt-2 min-h-0 flex-1 overflow-y-auto'
    : 'mt-3 max-h-72 overflow-y-auto'

  const emptyMessage =
    scope === 'current'
      ? 'No template entities in the payload.'
      : 'No mock entity states stored for this project.'

  const canEditAttributes = Boolean(onSetMockAttribute)

  const entityList = (
    <ul className="flex flex-col gap-2">
      {entityRows.length === 0 ? (
        <li className="list-none">
          <p className={`text-xs ${shell.muted}`}>{emptyMessage}</p>
        </li>
      ) : (
        entityRows.map((row) => {
          const attributes = attributesByEntity[row.entityId] ?? {}
          const attributeNames = Object.keys(attributes).sort()
          const draft = getAttributeDraft(row.entityId)
          return (
            <li
              key={row.entityId}
              className={`flex flex-col gap-1.5 rounded border ${shell.panelBorder} p-2`}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[11px] ${row.referenced ? 'text-[var(--shell-text)]' : shell.muted}`}
                  title={row.entityId}
                >
                  {row.entityId}
                  {!row.referenced ? ' · manual' : ''}
                </span>
                <input
                  type="text"
                  className={`${shell.input} w-20 px-1.5 py-1 text-[11px]`}
                  value={formatMockValue(row.value)}
                  onChange={(event) => onSetMockState(row.entityId, event.target.value)}
                  onFocus={() => onFocusEntity?.(row.entityId)}
                  aria-label={`Mock state for ${row.entityId}`}
                />
                {!row.referenced ? (
                  <button
                    type="button"
                    className={`${shell.button} w-7 shrink-0 px-0`}
                    aria-label={`Remove ${row.entityId}`}
                    onClick={() => onRemoveEntity(row.entityId)}
                  >
                    ×
                  </button>
                ) : (
                  <span aria-hidden="true" className="w-7 shrink-0" />
                )}
              </div>

              {canEditAttributes ? (
                <div className="flex flex-col gap-1 pl-2">
                  {attributeNames.map((attributeName) => (
                    <div key={attributeName} className="flex items-center gap-1">
                      <input
                        type="text"
                        className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[10px]`}
                        defaultValue={attributeName}
                        onBlur={(event) =>
                          onRenameMockAttribute?.(row.entityId, attributeName, event.target.value)
                        }
                        aria-label={`Attribute name ${attributeName} for ${row.entityId}`}
                      />
                      <input
                        type="text"
                        className={`${shell.input} w-20 px-1.5 py-0.5 text-[10px]`}
                        value={formatAttributeValue(attributes[attributeName])}
                        onChange={(event) =>
                          onSetMockAttribute?.(
                            row.entityId,
                            attributeName,
                            coerceAttributeValue(event.target.value),
                          )
                        }
                        aria-label={`Attribute ${attributeName} of ${row.entityId}`}
                      />
                      <button
                        type="button"
                        className={`${shell.button} w-7 shrink-0 px-0`}
                        aria-label={`Remove attribute ${attributeName} of ${row.entityId}`}
                        onClick={() => onRemoveMockAttribute?.(row.entityId, attributeName)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[10px]`}
                      placeholder="attribute"
                      value={draft.name}
                      onChange={(event) =>
                        setAttributeDraft(row.entityId, { ...draft, name: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitAttributeDraft(row.entityId)
                        }
                      }}
                      aria-label={`New attribute name for ${row.entityId}`}
                    />
                    <input
                      type="text"
                      className={`${shell.input} w-20 px-1.5 py-0.5 text-[10px]`}
                      placeholder="value"
                      value={draft.value}
                      onChange={(event) =>
                        setAttributeDraft(row.entityId, { ...draft, value: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitAttributeDraft(row.entityId)
                        }
                      }}
                      aria-label={`New attribute value for ${row.entityId}`}
                    />
                    <button
                      type="button"
                      className={`${shell.button} w-7 shrink-0 px-0`}
                      aria-label={`Add attribute to ${row.entityId}`}
                      onClick={() => commitAttributeDraft(row.entityId)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })
      )}
      <li className="flex list-none items-center gap-1">
        <input
          type="text"
          className={`${shell.input} min-w-0 flex-1 px-1.5 py-1 font-mono text-[11px]`}
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
          className={`${shell.input} w-20 px-1.5 py-1 text-[11px]`}
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
        <button
          type="button"
          className={`${shell.button} w-7 shrink-0 px-0`}
          aria-label="Add entity"
          onClick={commitDraftEntity}
        >
          +
        </button>
      </li>
    </ul>
  )

  return (
    <Wrapper className={wrapperClass}>
      <div className={embedded ? 'shrink-0' : undefined}>
        {!embedded ? <h2 className={shell.heading}>State simulator</h2> : null}
        <div className={`flex items-start justify-between gap-2 ${embedded ? '' : 'mt-1'}`}>
          <p className={`min-w-0 flex-1 text-xs ${shell.muted}`}>
            Mock Home Assistant entity states and attributes for template preview.
          </p>
          <PanelScopeToggle scope={scope} onScopeChange={onScopeChange} />
        </div>
      </div>

      {embedded ? <div className={listScrollClassName}>{entityList}</div> : entityList}
    </Wrapper>
  )
}
