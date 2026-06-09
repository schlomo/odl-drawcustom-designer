import { shell } from '../styles/shell'

/** Active segment / toggle chrome shared by zoom chips and {@link FeatureToggle}. */
export const toolbarChipActive =
  'border-[var(--shell-accent)] bg-[var(--shell-accent)] text-white shadow-inner ring-1 ring-inset ring-black/15'

const toolbarChipSize = 'shrink-0 rounded-md border px-2 py-1 text-xs transition-colors'

/** Mutually exclusive toolbar segment (e.g. zoom presets). */
export function toolbarChipClassName(active: boolean, extra = ''): string {
  return active
    ? `${toolbarChipSize} ${toolbarChipActive} ${extra}`.trim()
    : `${toolbarChipSize} ${shell.button} opacity-80 ${extra}`.trim()
}

/** Binary on/off toolbar control with optional icon + label. */
export function toggleButtonClassName(enabled: boolean, extra = ''): string {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
    enabled ? toolbarChipActive : `${shell.button} opacity-80`
  } ${extra}`.trim()
}
