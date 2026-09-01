import type { ExportActionFeedback } from '../lib/export-action-feedback'
import { toolbarGroupRow, toolbarGroupsRow } from '../lib/export-action-feedback'
import type { SnapGridPrefs } from '../preferences/snapGrid'
import type { CanvasZoomMode } from '../preferences/canvasZoom'
import { getCopyPngUnavailableReason } from '../lib/export-download'
import { ExportIconButton } from './ExportIconButton'
import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { ToolbarChipButton } from './ToolbarChipButton'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

const ZOOM_MODES: { mode: CanvasZoomMode; label: string }[] = [
  { mode: '200', label: '200%' },
  { mode: '100', label: '100%' },
  { mode: 'fit', label: 'Fit' },
  { mode: '50', label: '50%' },
]

export interface CanvasHeaderToolbarProps {
  showLabels: boolean
  zoomMode: CanvasZoomMode
  onZoomModeChange: (mode: CanvasZoomMode) => void
  getFeedback: (actionId: string) => ExportActionFeedback | null
  getFeedbackMessage: (actionId: string) => string | null
  onCopyPng: () => void
  onDownloadPng: () => void
  canUndo: boolean
  canRedo: boolean
  /**
   * The YAML document is broken and Undo is the escape out of it (maintainer
   * ruling 2026-09-01): it returns to the last valid design instead of
   * stepping the element history back. That target always exists, so `canUndo`
   * does not gate it — and the control says what it really does, because a
   * user expecting a keystroke-level undo would otherwise lose a paragraph.
   *
   * Redo has no equivalent and stays disabled: the unparseable text was never
   * committed, so no forward element state corresponds to it, and stepping
   * forward would throw the text away to reach a design the user did not ask
   * for. The asymmetry is deliberate.
   */
  undoEscapesBlock?: boolean
  onUndo: () => void
  onRedo: () => void
  showHiddenHints: boolean
  onToggleShowHiddenHints: () => void
  snapGrid: SnapGridPrefs
  onToggleSnap: () => void
  previewDitherMode: 0 | 2
  onTogglePreviewDither: () => void
  /** Off-screen width probe — always labeled, non-interactive. */
  measureOnly?: boolean
  /**
   * No element mutation — the YAML doc is blocked (issue #35) or the host
   * display preview is showing (issue #109). Disables undo/redo; the export,
   * zoom and dither controls stay live either way.
   */
  blocked?: boolean
}

/**
 * Says what the control actually does while the document is broken: it does
 * not step back one keystroke, it jumps to the last valid design. Deliberately
 * kept to one short line — `ToolbarTooltip` bubbles are `whitespace-nowrap`,
 * and an embedded host may give the mount no room to either side, so the full
 * detail (including CodeMirror's own Ctrl/Cmd+Z as the keystroke-level
 * alternative) lives in the confirmation prompt, which the user cannot miss.
 */
const UNDO_ESCAPE_TOOLTIP = 'Undo — return to the last valid design'

/**
 * Redo gets no escape counterpart, and says so rather than looking merely
 * greyed out: the unparseable text was never committed, so no forward element
 * state corresponds to it. Stepping forward would discard the user's typing to
 * reach a design they never asked to return to.
 */
const REDO_BLOCKED_TOOLTIP = 'Redo — unavailable while the YAML is invalid'

export function CanvasHeaderToolbar({
  showLabels,
  zoomMode,
  onZoomModeChange,
  getFeedback,
  getFeedbackMessage,
  onCopyPng,
  onDownloadPng,
  canUndo,
  canRedo,
  undoEscapesBlock = false,
  onUndo,
  onRedo,
  showHiddenHints,
  onToggleShowHiddenHints,
  snapGrid,
  onToggleSnap,
  previewDitherMode,
  onTogglePreviewDither,
  measureOnly = false,
  blocked = false,
}: CanvasHeaderToolbarProps) {
  const labelsVisible = measureOnly || showLabels
  const ditherLabel = `Dither ${previewDitherMode === 2 ? 'd=2' : 'flat'}`
  const noop = () => {}
  // Issue #80: signal clipboard availability upfront — on insecure origins
  // (plain-http LAN HA boxes) Copy PNG is warning-marked from first paint.
  // The width probe skips it: the badge/hint are absolutely positioned
  // overlays and must not appear twice for assistive tech.
  const copyPngWarning = measureOnly ? null : getCopyPngUnavailableReason()

  return (
    <div className={toolbarGroupsRow}>
      <div className={toolbarGroupRow} role="group" aria-label="Canvas export">
        <ExportIconButton
          actionId="copy-png"
          feedback={measureOnly ? null : getFeedback('copy-png')}
          feedbackMessage={measureOnly ? null : getFeedbackMessage('copy-png')}
          warning={copyPngWarning}
          iconPath={TOOL_ICONS.copy}
          tooltip="Copy PNG"
          label={labelsVisible ? 'Copy PNG' : undefined}
          onClick={measureOnly ? noop : onCopyPng}
          data-canvas-toolbar
        />
        <ExportIconButton
          actionId="download-png"
          feedback={measureOnly ? null : getFeedback('download-png')}
          feedbackMessage={measureOnly ? null : getFeedbackMessage('download-png')}
          iconPath={TOOL_ICONS.download}
          tooltip="Download PNG"
          label={labelsVisible ? 'Download PNG' : undefined}
          onClick={measureOnly ? noop : onDownloadPng}
          data-canvas-toolbar
        />
      </div>
      <div className={toolbarGroupRow} role="group" aria-label="Edit history">
        <ExportIconButton
          actionId="undo"
          feedback={measureOnly ? null : getFeedback('undo')}
          iconPath={TOOL_ICONS.undo}
          tooltip={undoEscapesBlock ? UNDO_ESCAPE_TOOLTIP : 'Undo'}
          // The visible label stays "Undo" — it is a measured, collapsing
          // toolbar (ADR-016) and the honest long-form explanation lives in
          // the hover title and, unmissably, in the confirmation prompt.
          label={labelsVisible ? 'Undo' : undefined}
          title={undoEscapesBlock ? UNDO_ESCAPE_TOOLTIP : undefined}
          disabled={measureOnly || (undoEscapesBlock ? false : !canUndo || blocked)}
          onClick={measureOnly ? noop : onUndo}
          data-canvas-toolbar
        />
        <ExportIconButton
          actionId="redo"
          feedback={measureOnly ? null : getFeedback('redo')}
          iconPath={TOOL_ICONS.redo}
          tooltip={undoEscapesBlock ? REDO_BLOCKED_TOOLTIP : 'Redo'}
          label={labelsVisible ? 'Redo' : undefined}
          title={undoEscapesBlock ? REDO_BLOCKED_TOOLTIP : undefined}
          disabled={measureOnly || !canRedo || blocked}
          onClick={measureOnly ? noop : onRedo}
          data-canvas-toolbar
        />
      </div>
      <div className={toolbarGroupRow} role="group" aria-label="Canvas zoom">
        {ZOOM_MODES.map(({ mode, label }) => {
          const active = zoomMode === mode
          return (
            <ToolbarChipButton
              key={mode}
              data-canvas-toolbar
              disabled={measureOnly}
              active={active}
              onClick={measureOnly ? noop : () => onZoomModeChange(mode)}
              aria-pressed={active}
              aria-current={active ? 'true' : undefined}
              title={`Zoom ${label}`}
            >
              {label}
            </ToolbarChipButton>
          )
        })}
      </div>
      <div className={toolbarGroupRow} role="group" aria-label="Canvas view options">
        <FeatureToggle
          enabled={showHiddenHints}
          onToggle={measureOnly ? noop : onToggleShowHiddenHints}
          textLabel="Invisible"
          showTextLabel={labelsVisible}
          detailedTitle="Show designer overlays for elements invisible on the tag (visible: false, fill: none)"
          data-canvas-toolbar
          className={labelsVisible ? '' : 'px-1.5'}
        >
          {labelsVisible ? (
            <span>Invisible</span>
          ) : (
            <MdiIcon path={TOOL_ICONS.invisible} size={16} className="shrink-0" />
          )}
        </FeatureToggle>
        <FeatureToggle
          enabled={snapGrid.enabled}
          onToggle={measureOnly ? noop : onToggleSnap}
          textLabel="Snap"
          showTextLabel={labelsVisible}
          detailedTitle="Snap moved and resized elements to the grid"
          data-canvas-toolbar
          className={labelsVisible ? '' : 'px-1.5'}
        >
          {labelsVisible ? (
            <span>Snap</span>
          ) : (
            <MdiIcon path={TOOL_ICONS.snap} size={16} className="shrink-0" />
          )}
        </FeatureToggle>
        <FeatureToggle
          enabled={previewDitherMode === 2}
          onToggle={measureOnly ? noop : onTogglePreviewDither}
          textLabel={ditherLabel}
          showTextLabel={labelsVisible}
          detailedTitle={`Preview dither ${previewDitherMode === 2 ? 'd=2' : 'flat'}`}
          data-canvas-toolbar
          className={labelsVisible ? '' : 'px-1.5'}
        >
          {labelsVisible ? (
            <span>{ditherLabel}</span>
          ) : (
            <MdiIcon path={TOOL_ICONS.dither} size={16} className="shrink-0" />
          )}
        </FeatureToggle>
      </div>
    </div>
  )
}
