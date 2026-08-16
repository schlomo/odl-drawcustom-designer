import { Fragment, type ReactElement } from 'react'
import { hostActionIconPath } from '../../embed/hostActionIcons'
import type { HostAction, HostActionSeverity } from '../../embed/types'
import { IconButton } from './IconButton'
import { TextButton } from './TextButton'
import { ToolbarTooltip } from './ToolbarTooltip'
import { shell } from '../styles/shell'

interface HostActionButtonsProps {
  actions: readonly HostAction[]
  /**
   * Reason the designer itself cannot run any action right now (a blocked
   * YAML document, exactly what disables Save). A host's own
   * `disabledReason` wins over it — the host's statement about its own action
   * is the more specific one.
   */
  designerDisabledReason?: string | null
  onAction: (id: string) => void
}

type ButtonVariant = 'default' | 'caution' | 'destructive'

const VARIANTS: Record<HostActionSeverity, ButtonVariant> = {
  normal: 'default',
  caution: 'caution',
  danger: 'destructive',
}

/** Icon-button surfaces carry no padding of their own — {@link IconButton} adds it. */
const ICON_SURFACES: Record<HostActionSeverity, string> = {
  normal: shell.button,
  caution: shell.buttonCautionIcon,
  danger: shell.buttonDestructiveIcon,
}

/**
 * The host-registered action buttons (issue #108, ADR-018 actions seam).
 *
 * A typed, closed button list rendered in the designer's own chrome: the host
 * supplies label, icon, severity and an optional reason for being disabled,
 * and gets back only which button the user clicked (`onAction`). No host
 * markup, styles or components enter the shadow root.
 *
 * The designer's built-in Save button is the same species of control and
 * becomes an action instance at 2.0 (issue #121) — `{ id: 'save', label:
 * 'Save' }` rendered through here, with `onSaveRequest` deleted. Keep this
 * component free of action-specific behavior so that stays a deletion.
 */
export function HostActionButtons({
  actions,
  designerDisabledReason,
  onAction,
}: HostActionButtonsProps) {
  return (
    <>
      {actions.map((action) => {
        const severity = action.severity ?? 'normal'
        const disabledReason = action.disabledReason ?? designerDisabledReason ?? null
        const disabled = disabledReason != null

        const button: ReactElement = action.icon ? (
          <IconButton
            iconPath={hostActionIconPath(action.icon)}
            label={action.label}
            surfaceClass={ICON_SURFACES[severity]}
            disabled={disabled}
            onClick={() => onAction(action.id)}
          />
        ) : (
          <TextButton
            variant={VARIANTS[severity]}
            disabled={disabled}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </TextButton>
        )

        // Disabled buttons swallow the native `title` (ADR-016), so the
        // reason has to ride the hover-tooltip pattern to be readable at all.
        return disabledReason != null ? (
          <ToolbarTooltip key={action.id} label={disabledReason}>
            {button}
          </ToolbarTooltip>
        ) : (
          <Fragment key={action.id}>{button}</Fragment>
        )
      })}
    </>
  )
}
