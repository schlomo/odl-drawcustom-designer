/**
 * Embeddable designer library entry (issue #20, ADR-010).
 *
 * `npm run build:lib` bundles this module (React included) into a single
 * self-contained ESM file for hosts like the OpenDisplay HA integration.
 */
export { mount } from './mount'
/**
 * The designer build's version (issue #23): package.json's version, baked
 * in at build time (`tools/version.ts`). Same value as `MountHandle.version`
 * — lets a host log which build it embeds before or without mounting.
 */
export { APP_VERSION as version } from '../core'
export type {
  CapabilitiesPushOptions,
  EmbedTheme,
  HostCapabilities,
  HostEntityState,
  HostStates,
  MountHandle,
  MountOptions,
} from './types'
