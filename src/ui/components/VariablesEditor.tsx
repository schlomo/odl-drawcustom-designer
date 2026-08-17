import { useMemo, useState } from 'react'
import type { DrawElement } from '../../core'
import { scanPayloadForTemplates } from '../../core'
import { shell } from '../styles/shell'
import type { PanelListScope } from './PanelScopeToggle'

interface VariablesEditorProps {
  elements: DrawElement[]
  variables?: Record<string, string>
  /**
   * `current` lists only the variables the payload references (a stale stored
   * name left over from a YAML rename disappears); `all` adds every stored one.
   * A panel with no scope toggle of its own passes `all` — a variable the user
   * just added is not referenced yet, and must not vanish from under them.
   */
  scope: PanelListScope
  onSetVariable?: (name: string, value: string) => void
  onAddVariable?: (name: string, value: string) => void
  onRenameVariable?: (previousName: string, nextName: string) => void
  onRemoveVariable?: (name: string) => void
}

/** Matches the core rule for bare-identifier variable names (`{{ name }}`). */
function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name)
}

/**
 * Shared-variable editor: literal values substituted into every templated field
 * (`{{ accent_color }}`).
 *
 * Its own section rather than part of the State Simulator (maintainer ruling
 * 2026-08-17) because variables are **not host state**: no host channel supplies
 * them, so the ADR-018 Simulator-off policy covers states only. Standalone
 * renders it inside the Simulator exactly as before; a host-fed designer renders
 * it beside the read-only referenced-states panel, where it is the one thing in
 * that tab the user still owns.
 */
export function VariablesEditor({
  elements,
  variables = {},
  scope,
  onSetVariable,
  onAddVariable,
  onRenameVariable,
  onRemoveVariable,
}: VariablesEditorProps) {
  const [draft, setDraft] = useState({ name: '', value: '' })
  const [adderExpanded, setAdderExpanded] = useState(false)

  const scannedVariables = useMemo(
    () => scanPayloadForTemplates(elements).variablesReferenced,
    [elements],
  )

  // Referenced-but-unset names pre-fill as empty-valued rows; their stored
  // value (if any) still displays via `variables[name]`.
  const variableNames = useMemo(() => {
    if (scope === 'current') {
      return [...new Set(scannedVariables)].sort()
    }
    return [...new Set([...Object.keys(variables), ...scannedVariables])].sort()
  }, [variables, scannedVariables, scope])

  const commitDraft = () => {
    const name = draft.name.trim()
    if (!isValidVariableName(name)) {
      return
    }
    onAddVariable?.(name, draft.value)
    setDraft({ name: '', value: '' })
    setAdderExpanded(false)
  }

  return (
    <div className={`rounded border ${shell.panelBorder} p-2`} data-testid="variables-editor">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${shell.muted}`}>
          Variables
        </h3>
        <span className={`text-[10px] ${shell.muted}`} title="Literal values shared across all fields">
          literal · shared
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {variableNames.map((name) => {
          const referenced = scannedVariables.includes(name)
          const stored = name in variables
          return (
            <li key={name} className="flex items-center gap-1">
              {referenced ? (
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[11px] ${stored ? 'text-[var(--shell-text)]' : shell.muted}`}
                  title={`${name} · used in payload`}
                >
                  {name}
                </span>
              ) : (
                <input
                  type="text"
                  className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[11px]`}
                  defaultValue={name}
                  onBlur={(event) => onRenameVariable?.(name, event.target.value)}
                  aria-label={`Variable name ${name}`}
                />
              )}
              <input
                type="text"
                className={`${shell.input} w-20 px-1.5 py-0.5 text-[11px]`}
                value={variables[name] ?? ''}
                placeholder={referenced && !stored ? 'value' : undefined}
                onChange={(event) => onSetVariable?.(name, event.target.value)}
                aria-label={`Value for variable ${name}`}
              />
              {referenced ? (
                <span aria-hidden="true" className="w-7 shrink-0" />
              ) : (
                <button
                  type="button"
                  className={`${shell.button} w-7 shrink-0 px-0`}
                  aria-label={`Remove variable ${name}`}
                  onClick={() => onRemoveVariable?.(name)}
                >
                  ×
                </button>
              )}
            </li>
          )
        })}
        {adderExpanded ? (
          <li className="flex list-none items-center gap-1">
            <input
              type="text"
              className={`${shell.input} min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[11px]`}
              placeholder="uv_fill"
              value={draft.name}
              autoFocus
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitDraft()
                } else if (event.key === 'Escape') {
                  setDraft({ name: '', value: '' })
                  setAdderExpanded(false)
                }
              }}
              aria-label="New variable name"
            />
            <input
              type="text"
              className={`${shell.input} w-20 px-1.5 py-0.5 text-[11px]`}
              placeholder="value"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitDraft()
                } else if (event.key === 'Escape') {
                  setDraft({ name: '', value: '' })
                  setAdderExpanded(false)
                }
              }}
              aria-label="New variable value"
            />
            <button
              type="button"
              className={`${shell.button} w-7 shrink-0 px-0`}
              aria-label="Add variable"
              onClick={commitDraft}
            >
              +
            </button>
          </li>
        ) : (
          <li className="list-none">
            <button
              type="button"
              className={`self-start text-[10px] ${shell.muted} hover:underline`}
              aria-label="Add variable"
              onClick={() => setAdderExpanded(true)}
            >
              + variable
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
