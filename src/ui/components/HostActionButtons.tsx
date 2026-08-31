import { useId, type ReactElement } from 'react'
import { resolveMdiPath } from '../../core'
import type { HostAction, HostActionSeverity } from '../../embed/types'
import { IconButton } from './IconButton'
import { TextButton } from './TextButton'
import { ToolbarTooltip } from './ToolbarTooltip'
import { shell } from '../styles/shell'

interface HostActionButtonsProps {
  actions: readonly HostAction[]
  /**
   * Reason the designer itself cannot run a payload-carrying action right now
   * (a blocked YAML document). Applies only to actions that need the payload —
   * `needsPayload: false` opts out. A host's own `disabledReason` wins over it:
   * the host's statement about its own action is the more specific one.
   */
  designerDisabledReason?: string | null
  /**
   * Icon + text when true, icon-only when false — the page header's measured
   * label collapse (ADR-016). An action registered **without** an `icon` keeps
   * its text either way: its label is the only identity it has, and a shared
   * placeholder glyph would make two such buttons indistinguishable. Hosts that
   * want their buttons to survive a narrow panel should register an `icon`
   * (docs/embedding.md).
   */
  showLabels?: boolean
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
  normal: shell.buttonIcon,
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
 * Save is one of these buttons and nothing special (issue #121): a host that
 * wants one registers `{ id: 'save', label: 'Save' }`. Keep this component free
 * of action-specific behavior — the designer must never know which action means
 * what.
 */
export function HostActionButtons({
  actions,
  designerDisabledReason,
  showLabels = true,
  onAction,
}: HostActionButtonsProps) {
  const reasonIdPrefix = useId()
  return (
    <>
      {actions.map((action) => {
        const severity = action.severity ?? 'normal'
        // A blocked document only blocks what reads the payload; an action
        // that opted out (`needsPayload: false`) stays clickable and receives
        // the last valid payload, as getPayload() documents.
        const blockedByDesigner = action.needsPayload === false ? null : designerDisabledReason
        const disabledReason = action.disabledReason ?? blockedByDesigner ?? null
        const disabled = disabledReason != null
        // Disabled buttons take no pointer events, so the hover bubble below
        // is the sighted reader's channel; this description is the one
        // assistive tech gets, without hovering anything.
        const reasonId = disabled ? `${reasonIdPrefix}${action.id}` : undefined

        const iconPath = action.icon ? resolveMdiPath(action.icon) : null
        // Collapsed, the button's own tooltip is the only place its label can
        // live, so it absorbs the disabled reason too — the wrapper below must
        // then render no bubble of its own, or the two would stack on top of
        // each other under the pointer.
        const collapsedIcon = iconPath != null && !showLabels
        const iconTooltip =
          collapsedIcon && disabledReason != null
            ? `${action.label} — ${disabledReason}`
            : action.label
        const wrapperTooltip = collapsedIcon ? undefined : (disabledReason ?? undefined)
        const button: ReactElement = iconPath ? (
          <IconButton
            iconPath={iconPath}
            label={showLabels ? action.label : undefined}
            tooltip={iconTooltip}
            tooltipPlacement="below"
            tooltipAlign="end"
            surfaceClass={ICON_SURFACES[severity]}
            disabled={disabled}
            aria-describedby={reasonId}
            onClick={() => onAction(action.id)}
          />
        ) : (
          <TextButton
            variant={VARIANTS[severity]}
            disabled={disabled}
            aria-describedby={reasonId}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </TextButton>
        )

        // Rendered unconditionally, reason or not: a conditional wrapper
        // swaps the element type on every `disabledReason` push, which
        // remounts the button and drops keyboard focus. An absent label
        // renders the wrapper with no bubble (see ToolbarTooltip).
        //
        // `placement="below"` (maintainer ruling 2026-08-16, actions toolbar
        // screenshot): these buttons sit in the designer's own top row. An
        // embedded host (HA panel iframe/shadow container) may give the
        // mount zero space above it, so an upward bubble is clipped by the
        // frame or paints over host chrome — floating UI must never assume
        // space exists outside the designer's own boundary.
        return (
          <ToolbarTooltip
            key={action.id}
            label={wrapperTooltip}
            placement="below"
          >
            {button}
            {reasonId ? (
              <span id={reasonId} className="sr-only">
                {disabledReason}
              </span>
            ) : null}
          </ToolbarTooltip>
        )
      })}
    </>
  )
}
