# Releasing (issue #23)

The designer's release artifact is the **library build** (`npm run build:lib`,
[ADR-010](adr/ADR-010-ha-embed-mode.md)): one self-contained ESM file that the
concrete consumer — the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44)
— vendors as a static file inside `custom_components/opendisplay/designer/frontend/`
and cache-busts with its own build token. **npm publishing is not required**
for this path and isn't set up.

## Semver policy

The **public surface that major-versions** is the embed API: `mount()`, the
`MountOptions`/`MountHandle`/`HostCapabilities`/`HostStates` shapes in
[`src/embed/types.ts`](../src/embed/types.ts), and the host data contract
documented in [`docs/embedding.md`](embedding.md) (states/capabilities
mapping, payload/theme behavior). Internal modules (`src/core/`, `src/ui/`,
anything not re-exported from `src/embed/index.ts`) are not part of the
versioned surface and can change freely.

- **Major** — a breaking change to the mount API or host data contract (a
  removed/renamed export or field, a changed method signature, a
  capabilities/states field whose meaning changes).
- **Minor** — additive, backwards-compatible surface (new optional option,
  new `HostCapabilities` field, new `MountHandle` method).
- **Patch** — fixes and internal changes with no embed-surface change.
- **First release is `1.0.0`** — no `0.x` pre-release phase; the mount API
  is considered stable from the first tag, and major/minor/patch above
  apply immediately.

## Runtime version

The designer's version is baked in at build time from `package.json`
(`tools/version.ts` + `tools/buildDefines.ts`, following the `vitest:`
short-circuit pattern used for the git revision/branch labels) and exposed
two ways so a host can log which build it embeds:

- a `version` named export from the library entry (`import { version } from
  './odl-drawcustom-designer.js'`)
- a `version` field on the `MountHandle` returned by `mount()`

Both report the same string; see [`docs/embedding.md`](embedding.md#version).

## Release procedure (maintainer)

1. Bump `package.json`'s `version` to the new `X.Y.Z` (no `v` prefix, no
   pre-release suffix — the release workflow only accepts plain semver
   tags) and commit it to `main`.
2. Tag the commit and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. Pushing the tag triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml),
   which:
   - runs `node tools/releaseVersion.ts "$TAG"` — fails the run loudly if
     the tag doesn't match `package.json`'s version (thin CI: all the
     matching logic lives in [`tools/releaseVersion.ts`](../tools/releaseVersion.ts),
     unit-tested in `tests/tools/releaseVersion.test.ts`)
   - runs `npm run lint`, `npm test`, `npm run build:lib`
   - creates a GitHub release named after the tag, with
     **GitHub's auto-generated release notes** (commits since the previous
     tag) — the simplest changelog option, no extra conventions or tooling
     required
   - attaches the artifact: `dist-lib/odl-drawcustom-designer.js` and the
     repository's `LICENSE`

No tag is ever pushed by an AI agent working on this repo — only the
maintainer cuts a release.

**Status:** the workflow itself is unverified until a real tag is pushed
(it can't be exercised end-to-end without one); `tools/releaseVersion.ts`
is covered by unit tests, and `npm run build:lib` is verified locally.

## Future: AI-generated release notes

GitHub's auto-generated notes are the deliberate v1 choice — no extra
conventions or tooling required. An AI-written narrative changelog
(summarizing the merged PRs since the previous tag) is an anticipated
upgrade path: the release workflow's thin-YAML-calling-`tools/`-scripts
structure leaves room to swap in a different notes step later without
restructuring the workflow itself.

## Artifact contents

- `odl-drawcustom-designer.js` — the single self-contained ESM (React,
  styles, fonts inlined; see [`docs/embedding.md`](embedding.md#library-build))
- `LICENSE` — this repository's Apache-2.0 license

No separate third-party notices file is generated. Bundled dependency
licenses are whatever's recorded in this repo's `package-lock.json`
provenance (`npm ls`, or inspect the lockfile) — building a license scanner
for this is out of scope; consult the lockfile if a consumer needs a full
dependency license inventory.

## Consumer story

The OpenDisplay HA integration pins a release (tag or version number),
downloads that release's `odl-drawcustom-designer.js` asset, and vendors it
as a static file the same way it already vendors `js-yaml.mjs` — served from
`custom_components/opendisplay/designer/frontend/` and cache-busted with its
own build token. It can read the exposed `version` (library export or
`MountHandle.version`) to log/report which designer build is embedded, e.g.
in diagnostics or a support panel.
