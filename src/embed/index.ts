/**
 * Embeddable designer library entry (issue #20, ADR-010).
 *
 * `npm run build:lib` bundles this module (React included) into a single
 * self-contained ESM file for hosts like the OpenDisplay HA integration.
 */
export { mount } from './mount'
/**
 * The designer build's version (issue #23, reworked 2026-07-29: git tags are
 * the sole version source, `package.json` stays pinned at `0.0.0`). A
 * release build bakes in the tag-derived version via the `APP_VERSION` env
 * var (`tools/autoRelease.ts` sets it, `tools/version.ts` resolves it); any
 * other build (local dev, CI `checks`) falls back to `'0.0.0-dev'`, and
 * Vitest gets the fixed string `'test'`. Same value as `MountHandle.version`
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
