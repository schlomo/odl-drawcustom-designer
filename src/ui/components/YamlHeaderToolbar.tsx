import type { ExportActionFeedback } from '../lib/export-action-feedback'
import { toolbarGroupRow, toolbarGroupsRow } from '../lib/export-action-feedback'
import { ExportIconButton } from './ExportIconButton'
import { YamlCouplingToggle } from './YamlCouplingToggle'
import { YamlFontSizeControls } from './YamlFontSizeControls'
import { YamlTemplatePreviewToggle } from './YamlTemplatePreviewToggle'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

export interface YamlHeaderToolbarProps {
  showLabels: boolean
  getFeedback: (actionId: string) => ExportActionFeedback | null
  getFeedbackMessage: (actionId: string) => string | null
  onCopyYaml: () => void
  onDownloadYaml: () => void
  templatePreviewEnabled: boolean
  onToggleTemplatePreview: () => void
  couplingEnabled: boolean
  onToggleCoupling: () => void
  fontSize: number
  onDecreaseFontSize: () => void
  onIncreaseFontSize: () => void
  /** Off-screen width probe — always labeled, non-interactive. */
  measureOnly?: boolean
}

export function YamlHeaderToolbar({
  showLabels,
  getFeedback,
  getFeedbackMessage,
  onCopyYaml,
  onDownloadYaml,
  templatePreviewEnabled,
  onToggleTemplatePreview,
  couplingEnabled,
  onToggleCoupling,
  fontSize,
  onDecreaseFontSize,
  onIncreaseFontSize,
  measureOnly = false,
}: YamlHeaderToolbarProps) {
  const labelsVisible = measureOnly || showLabels
  const noop = () => {}

  return (
    <div className={toolbarGroupsRow}>
      <div className={toolbarGroupRow} role="group" aria-label="YAML export">
        <ExportIconButton
          actionId="copy-yaml"
          feedback={measureOnly ? null : getFeedback('copy-yaml')}
          feedbackMessage={measureOnly ? null : getFeedbackMessage('copy-yaml')}
          iconPath={TOOL_ICONS.copy}
          tooltip="Copy YAML"
          label={labelsVisible ? 'Copy YAML' : undefined}
          onClick={measureOnly ? noop : onCopyYaml}
          data-yaml-toolbar
        />
        <ExportIconButton
          actionId="download-yaml"
          feedback={measureOnly ? null : getFeedback('download-yaml')}
          iconPath={TOOL_ICONS.download}
          tooltip="Download YAML"
          label={labelsVisible ? 'Download YAML' : undefined}
          onClick={measureOnly ? noop : onDownloadYaml}
          data-yaml-toolbar
        />
      </div>
      <div className={toolbarGroupRow} role="group" aria-label="YAML editor options">
        <YamlTemplatePreviewToggle
          enabled={templatePreviewEnabled}
          onToggle={measureOnly ? noop : onToggleTemplatePreview}
          showTextLabel={labelsVisible}
          data-yaml-toolbar
          className={labelsVisible ? '' : 'px-1.5'}
        />
        <YamlCouplingToggle
          enabled={couplingEnabled}
          onToggle={measureOnly ? noop : onToggleCoupling}
          showTextLabel={labelsVisible}
          data-yaml-toolbar
          className={labelsVisible ? '' : 'px-1.5'}
        />
        <YamlFontSizeControls
          fontSize={fontSize}
          onDecrease={measureOnly ? noop : onDecreaseFontSize}
          onIncrease={measureOnly ? noop : onIncreaseFontSize}
          showLabels={labelsVisible}
        />
      </div>
    </div>
  )
}
