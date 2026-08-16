import { shell } from '../styles/shell'

/** Active segment / toggle chrome shared by zoom chips and {@link FeatureToggle}. */
export const toolbarChipActive =
  'border-[var(--shell-accent)] bg-[var(--shell-accent)] text-white shadow-inner ring-1 ring-inset ring-black/15'

const toolbarChipSize = 'shrink-0 rounded-md border px-2 py-1 text-xs transition-colors'

/**
 * Mutually exclusive toolbar segment (e.g. zoom presets).
 *
 * The unselected branch is plain {@link shell.button} — no extra `opacity`
 * utility stacked on top (issue #132 maintainer follow-up, PR #135): that dimming was
 * exactly the "canvas/YAML toolbar looks lower-contrast than the top bar"
 * complaint. `opacity` composites the whole element against whatever's
 * behind it and doesn't touch `background-color`, so it silently undercut
 * the same WCAG-tuned tokens every other neutral button already stands on.
 */
export function toolbarChipClassName(active: boolean, extra = ''): string {
  return active
    ? `${toolbarChipSize} ${toolbarChipActive} ${extra}`.trim()
    : `${toolbarChipSize} ${shell.button} ${extra}`.trim()
}

/** Binary on/off toolbar control with optional icon + label. See {@link toolbarChipClassName}. */
export function toggleButtonClassName(enabled: boolean, extra = ''): string {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
    enabled ? toolbarChipActive : shell.button
  } ${extra}`.trim()
}
