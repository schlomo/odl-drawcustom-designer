/**
 * Embeddable designer library entry (issue #20, ADR-010).
 *
 * `npm run build:lib` bundles this module (React included) into a single
 * self-contained ESM file for hosts like the OpenDisplay HA integration.
 */
export { mount } from './mount'
export type {
  EmbedTheme,
  HostCapabilities,
  HostEntityState,
  HostStates,
  MountHandle,
  MountOptions,
} from './types'
