import type { HostAction } from '../../embed/types'
import type { ExportActionFeedback } from '../lib/export-action-feedback'
import { toolbarGroupRow, toolbarGroupsRow } from '../lib/export-action-feedback'
import { toolIconPath } from '../lib/mdi-tool-icons'
import type { ThemeMode } from '../preferences/theme'
import { ExportIconButton } from './ExportIconButton'
import { HostActionButtons } from './HostActionButtons'
import { IconButton } from './IconButton'
import { ThemeToggle } from './ThemeToggle'
import { shell } from '../styles/shell'

interface HeaderActionToolbarProps {
  /** Icon + text when true, icon-only when false (ADR-016 measured collapse). */
  showLabels: boolean
  /** Off-screen probe copy — always fully labeled, never shown to the user. */
  measureOnly?: boolean
  mutationBlocked: boolean
  yamlBlocked: boolean
  hostActions: readonly HostAction[]
  shareLink: boolean
  showThemeToggle: boolean
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  shareFeedback: ExportActionFeedback | null
  shareFeedbackMessage: string | null
  onClearAll: () => void
  onLoadDemo: () => void
  onShare: () => void
  onHostAction: (id: string) => void
  onCycleTheme: () => void
}

/**
 * The page header's right-hand action row (ADR-016 single-row toolbar chrome).
 *
 * Wired into the same measured label-collapse mechanism as the canvas and YAML
 * headers and the add-element bar: when the row no longer fits, every button
 * that has an icon drops its text and keeps the icon, with the text moving to a
 * `ToolbarTooltip`. Before this row was measured it was the only `shrink-0`
 * toolbar in the app with no collapse at all, which made the page header — not
 * the workspace — the thing that set the document's horizontal floor.
 *
 * Every tooltip here opens **downward** and is anchored to its button's right
 * edge: this is the designer's own top row at the right edge of the mount, and
 * an embedded host may give the mount zero space above or beside it (maintainer
 * ruling 2026-08-16). A centred bubble on a 28px collapsed button spills past
 * the mount boundary — `tests/e2e/embed-actions.spec.ts` measures that.
 */
export function HeaderActionToolbar({
  showLabels,
  measureOnly = false,
  mutationBlocked,
  yamlBlocked,
  hostActions,
  shareLink,
  showThemeToggle,
  themeMode,
  resolvedTheme,
  shareFeedback,
  shareFeedbackMessage,
  onClearAll,
  onLoadDemo,
  onShare,
  onHostAction,
  onCycleTheme,
}: HeaderActionToolbarProps) {
  // The probe exists to answer "would the labels still fit?", so it always
  // renders them regardless of the current collapsed state.
  const labelled = measureOnly || showLabels

  return (
    <div className={`${toolbarGroupsRow} shrink-0`}>
      <div className={toolbarGroupRow} role="group" aria-label="Session" data-header-toolbar>
        <IconButton
          iconPath={toolIconPath('delete')}
          label={labelled ? 'Clear all' : undefined}
          tooltip="Clear all"
          tooltipPlacement="below"
          tooltipAlign="end"
          surfaceClass={shell.buttonDestructiveIcon}
          disabled={mutationBlocked}
          onClick={onClearAll}
        />
      </div>
      <div className={toolbarGroupRow} role="group" aria-label="Demo" data-header-toolbar>
        <IconButton
          iconPath={toolIconPath('loadDemo')}
          label={labelled ? 'Load Demo' : undefined}
          tooltip="Load Demo"
          tooltipPlacement="below"
          tooltipAlign="end"
          disabled={mutationBlocked}
          onClick={onLoadDemo}
        />
      </div>
      {/* Save and send are host actions (ADR-018, issue #121): the designer
          has no save channel of its own, so it renders no Save button —
          a host registers one and owns what it means. */}
      {hostActions.length > 0 ? (
        <div className={toolbarGroupRow} role="group" aria-label="Actions" data-header-toolbar>
          <HostActionButtons
            actions={hostActions}
            showLabels={labelled}
            designerDisabledReason={
              yamlBlocked ? 'Fix the YAML errors before running this action' : null
            }
            onAction={onHostAction}
          />
        </div>
      ) : null}
      {/* Share links and the theme toggle are host policy: an embedding
          parent owns the payload and the page theme (#20, ADR-017). */}
      {shareLink ? (
        <div
          className={toolbarGroupRow}
          role="group"
          aria-label="Copy share link"
          data-header-toolbar
        >
          <ExportIconButton
            actionId="share-link"
            feedback={shareFeedback}
            feedbackMessage={shareFeedbackMessage}
            iconPath={toolIconPath('share')}
            tooltip="Copy share link"
            label={labelled ? 'Copy share link' : undefined}
            tooltipPlacement="below"
            tooltipAlign="end"
            onClick={onShare}
          />
        </div>
      ) : null}
      {showThemeToggle ? (
        <div className={toolbarGroupRow} role="group" aria-label="Appearance" data-header-toolbar>
          <ThemeToggle
            mode={themeMode}
            resolvedTheme={resolvedTheme}
            showLabel={labelled}
            onCycle={onCycleTheme}
          />
        </div>
      ) : null}
    </div>
  )
}
