import {
  mdiAlertOutline,
  mdiCheck,
  mdiContentSave,
  mdiCog,
  mdiDeleteOutline,
  mdiDownload,
  mdiEye,
  mdiPlay,
  mdiRefresh,
  mdiSend,
  mdiUpload,
} from '@mdi/js'

/**
 * The icons a host may put on an action button (issue #108, ADR-018).
 *
 * A **closed, named vocabulary**, not free-form icon data: the actions seam
 * is "a typed, closed list of buttons, never host-rendered UI inside the
 * shadow root" (ADR-018), and the designer bundles the paths so a host needs
 * no icon dependency of its own. Resolving arbitrary Material Design Icon
 * names is deliberately *not* offered — it would mean bundling all ~7000
 * paths into the single-file library build (issue #22).
 *
 * Names are domain-neutral verbs, not products: a non-HA host must read them
 * as meaningfully as the OpenDisplay integration does. Adding a name here is
 * additive; removing one is a breaking change (`normalizeHostActions` rejects
 * unknown names loudly rather than dropping the icon silently).
 */
export const HOST_ACTION_ICONS = {
  alert: mdiAlertOutline,
  check: mdiCheck,
  delete: mdiDeleteOutline,
  download: mdiDownload,
  play: mdiPlay,
  preview: mdiEye,
  refresh: mdiRefresh,
  save: mdiContentSave,
  send: mdiSend,
  settings: mdiCog,
  upload: mdiUpload,
} as const

/** Icon name accepted on {@link import('./types').HostAction.icon}. */
export type HostActionIcon = keyof typeof HOST_ACTION_ICONS

export const HOST_ACTION_ICON_NAMES = Object.keys(HOST_ACTION_ICONS) as HostActionIcon[]

export function isHostActionIcon(value: unknown): value is HostActionIcon {
  return typeof value === 'string' && value in HOST_ACTION_ICONS
}

/** The MDI path data the designer draws for `icon`. */
export function hostActionIconPath(icon: HostActionIcon): string {
  return HOST_ACTION_ICONS[icon]
}
