import { useMemo, useState } from 'react'
import type { DrawElement, HaMockContext } from '../../core'
import { coerceAttributeValue, scanPayloadForTemplates } from '../../core'
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

/**
 * Render an attribute value as an `<input>`-safe string. Must ALWAYS return a
 * string (never `undefined`, which would flip the input controlled→uncontrolled)
 * and must never throw (e.g. `JSON.stringify` on a BigInt or circular value),
 * which would crash the simulator.
 */
function formatAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value === null || value === undefined) {
    return ''
  }
  try {
    const json = JSON.stringify(value)
    return typeof json === 'string' ? json : ''
  } catch {
    return ''
  }
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
  const [expandedAdders, setExpandedAdders] = useState<Set<string>>(() => new Set())

  const scan = useMemo(() => scanPayloadForTemplates(elements), [elements])
  const scannedIds = useMemo(() => new Set(scan.entityIds), [scan])
  const scannedAttributesByEntity = scan.attributesByEntity

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
    collapseAdder(entityId)
  }

  const expandAdder = (entityId: string) => {
    setExpandedAdders((current) => {
      if (current.has(entityId)) {
        return current
      }
      const next = new Set(current)
      next.add(entityId)
      return next
    })
  }

  const collapseAdder = (entityId: string) => {
    setExpandedAdders((current) => {
      if (!current.has(entityId)) {
        return current
      }
      const next = new Set(current)
      next.delete(entityId)
      return next
    })
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
          const referencedAttributes = scannedAttributesByEntity[row.entityId] ?? []
          const referencedAttributeSet = new Set(referencedAttributes)
          // Union of stored attributes and attributes referenced in the payload
          // (pre-filled with empty values so users only enter the value).
          const attributeNames = [
            ...new Set([...Object.keys(attributes), ...referencedAttributes]),
          ].sort()
          const draft = getAttributeDraft(row.entityId)
          const adderExpanded = expandedAdders.has(row.entityId)
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
                  {attributeNames.map((attributeName) => {
                    const referenced = referencedAttributeSet.has(attributeName)
                    const stored = attributeName in attributes
                    return (
                      <div key={attributeName} className="flex items-center gap-1">
                        {referenced ? (
                          <span
                            className={`min-w-0 flex-1 truncate font-mono text-[10px] ${shell.muted}`}
                            title={`${attributeName} · used in payload`}
                          >
                            {attributeName}
                          </span>
                        ) : (
                          <input
                            type="text"
                            className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[10px]`}
                            defaultValue={attributeName}
                            onBlur={(event) =>
                              onRenameMockAttribute?.(
                                row.entityId,
                                attributeName,
                                event.target.value,
                              )
                            }
                            aria-label={`Attribute name ${attributeName} for ${row.entityId}`}
                          />
                        )}
                        <input
                          type="text"
                          className={`${shell.input} w-20 px-1.5 py-0.5 text-[10px]`}
                          value={formatAttributeValue(attributes[attributeName])}
                          placeholder={referenced && !stored ? 'value' : undefined}
                          onChange={(event) =>
                            onSetMockAttribute?.(
                              row.entityId,
                              attributeName,
                              coerceAttributeValue(event.target.value),
                            )
                          }
                          aria-label={`Attribute ${attributeName} of ${row.entityId}`}
                        />
                        {referenced ? (
                          <span aria-hidden="true" className="w-7 shrink-0" />
                        ) : (
                          <button
                            type="button"
                            className={`${shell.button} w-7 shrink-0 px-0`}
                            aria-label={`Remove attribute ${attributeName} of ${row.entityId}`}
                            onClick={() => onRemoveMockAttribute?.(row.entityId, attributeName)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {adderExpanded ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[10px]`}
                        placeholder="attribute"
                        value={draft.name}
                        autoFocus
                        onChange={(event) =>
                          setAttributeDraft(row.entityId, { ...draft, name: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            commitAttributeDraft(row.entityId)
                          } else if (event.key === 'Escape') {
                            setAttributeDraft(row.entityId, { name: '', value: '' })
                            collapseAdder(row.entityId)
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
                          } else if (event.key === 'Escape') {
                            setAttributeDraft(row.entityId, { name: '', value: '' })
                            collapseAdder(row.entityId)
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
                  ) : (
                    <button
                      type="button"
                      className={`self-start text-[10px] ${shell.muted} hover:underline`}
                      aria-label={`Add attribute to ${row.entityId}`}
                      onClick={() => expandAdder(row.entityId)}
                    >
                      + attribute
                    </button>
                  )}
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
