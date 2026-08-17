import { useMemo } from 'react'
import type { DrawElement } from '../../core'
import { scanPayloadForTemplates } from '../../core'
import type { HostStateCatalog } from '../../embed/hostContract'
import { formatAttributeValue, formatStateValue } from '../lib/state-value-format'
import { shell } from '../styles/shell'

interface ReferencedStatesPanelProps {
  elements: DrawElement[]
  catalog: HostStateCatalog
}

interface ReferencedAttributeRow {
  attribute: string
  value: string
  supplied: boolean
}

interface ReferencedStateRow {
  key: string
  name?: string
  value: string
  supplied: boolean
  attributes: ReferencedAttributeRow[]
}

const MISSING_TITLE = 'Referenced by this design, but the host does not supply it'

/** What a state or attribute the host does not supply reads as. */
function MissingValue() {
  return (
    <span className={`shrink-0 text-[10px] italic ${shell.muted}`} title={MISSING_TITLE}>
      not supplied
    </span>
  )
}

/**
 * Read-only referenced-states panel (issue #107, ADR-018 state catalog).
 *
 * Under a host-fed adapter this **replaces** the State Simulator (ADR-018
 * Simulator policy, resolving issue #24): the host owns the states, so there is
 * nothing here to edit — only what this design reads and what the host currently
 * answers. It lists exactly the keys the payload's templates name, live with
 * every push, and marks the ones the host does not supply rather than dressing
 * them up as a value. The host's *whole* catalog stays reachable through YAML /
 * template autocomplete, which is where you go to find a key, not here.
 */
export function ReferencedStatesPanel({ elements, catalog }: ReferencedStatesPanelProps) {
  const scan = useMemo(() => scanPayloadForTemplates(elements), [elements])

  const rows = useMemo<ReferencedStateRow[]>(() => {
    // Dotted attribute access (`states.sensor.x.attributes.y`) reaches a state
    // the entity-id scan alone does not report, so the union is what "the
    // payload references" actually means.
    const keys = [
      ...new Set([...scan.entityIds, ...Object.keys(scan.attributesByEntity)]),
    ].sort()
    return keys.map((key) => {
      const supplied = key in catalog.values
      const attributes = catalog.attributes[key] ?? {}
      return {
        key,
        name: catalog.names[key],
        value: supplied ? formatStateValue(catalog.values[key]!) : '',
        supplied,
        attributes: (scan.attributesByEntity[key] ?? []).map((attribute) => ({
          attribute,
          value: formatAttributeValue(attributes[attribute]),
          supplied: attribute in attributes,
        })),
      }
    })
  }, [scan, catalog])

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="referenced-states-panel">
      <div className="shrink-0">
        <p className={`text-xs ${shell.muted}`}>
          Live host states this design reads. Read-only — the host owns these values.
        </p>
      </div>

      <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="list-none">
            <p className={`text-xs ${shell.muted}`}>No states referenced by this design.</p>
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={row.key}
              data-testid={`referenced-state-row-${row.key}`}
              className={`flex flex-col gap-0.5 rounded border ${shell.panelBorder} p-2`}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={`min-w-0 flex-1 truncate text-[11px] ${row.name ? 'font-medium text-[var(--shell-text)]' : `font-mono ${shell.muted}`}`}
                  title={row.name ?? row.key}
                >
                  {row.name ?? row.key}
                </span>
                {row.supplied ? (
                  <span
                    className="shrink-0 font-mono text-[11px] text-[var(--shell-text)]"
                    title={row.value}
                  >
                    {row.value}
                  </span>
                ) : (
                  <MissingValue />
                )}
              </div>
              {row.name ? (
                <span className={`truncate font-mono text-[10px] ${shell.muted}`} title={row.key}>
                  {row.key}
                </span>
              ) : null}
              {row.attributes.length > 0 ? (
                <div className="flex flex-col gap-0.5 pl-2">
                  {row.attributes.map((attribute) => (
                    <div key={attribute.attribute} className="flex items-baseline gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate font-mono text-[10px] ${shell.muted}`}
                        title={`${attribute.attribute} · used in this design`}
                      >
                        {attribute.attribute}
                      </span>
                      {attribute.supplied ? (
                        <span
                          className={`shrink-0 font-mono text-[10px] ${shell.muted}`}
                          title={attribute.value}
                        >
                          {attribute.value}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>

      <p className={`mt-2 shrink-0 text-[10px] ${shell.muted}`}>
        Every host state is offered in YAML template autocomplete.
      </p>
    </div>
  )
}
