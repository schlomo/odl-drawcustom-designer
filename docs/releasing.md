# Releasing (issue #23, issue #93, reworked 2026-07-29)

The designer's release artifact is the **library build** (`npm run build:lib`,
[ADR-010](adr/ADR-010-ha-embed-mode.md)): one self-contained ESM file that the
concrete consumer — the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44)
— vendors as a static file inside `custom_components/opendisplay/designer/frontend/`
and cache-busts with its own build token. **npm publishing is not required**
for this path and isn't set up.

## Version source: git tags, not package.json

`package.json`'s `version` field is pinned to **`0.0.0` forever** — this repo
never `npm publish`es, so it has no meaning as a version source and isn't
used as one. The **only** source of truth for the designer's released
version is its `vX.Y.Z` git tags. See [Runtime version](#runtime-version)
below for how that reaches the built artifact.

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
- **First release is `v1.0.0`** — no `0.x` pre-release phase; the mount API
  is considered stable from the first tag, and major/minor/patch above
  apply immediately.

## Runtime version

The designer's version is baked in at build time from an `APP_VERSION`
environment variable (`tools/version.ts` + `tools/buildDefines.ts`,
following the `vitest:` short-circuit pattern used for the git revision/branch
labels) and exposed two ways so a host can log which build it embeds:

- a `version` named export from the library entry (`import { version } from
  './odl-drawcustom-designer.js'`)
- a `version` field on the `MountHandle` returned by `mount()`

Both report the same string; see [`docs/embedding.md`](embedding.md#version).
Only the release script (below) sets `APP_VERSION`; every other build (local
dev, the `checks` gate, GH Pages previews) has none set and reports
`0.0.0-dev` — the one documented silent fallback in this codebase (AGENTS.md,
"fail loudly" exception), never an error.

## Release procedure: automated (primary, issue #93)

**main = release.** Main is always stable — every merge is gated by the
`checks` job in [`pages.yml`](../.github/workflows/pages.yml) — so every push
to main is a release candidate. A single workflow,
[`.github/workflows/auto-release.yml`](../.github/workflows/auto-release.yml),
runs on every push to `main` (and via manual `workflow_dispatch` — see
[Manual retry](#manual-retry-workflow_dispatch) below, the *same* path, not a
separate one). It:

1. Checks out full history (`fetch-depth: 0`), installs deps, and runs
   `npm test` and `npm run lint` — the release never proceeds past a red gate.
2. Runs [`tools/autoRelease.ts`](../tools/autoRelease.ts), which:
   1. Lists `vX.Y.Z` tags **reachable from `HEAD`**
      (`git tag --list 'v*.*.*' --merged HEAD --sort=-v:refname`) and takes
      the newest as the latest release. The `--merged HEAD` ancestry check
      matters: without it, a stray `vX.Y.Z` tag pushed on some unmerged
      branch could sort ahead by version and silently become the base for
      the next bump.
   2. **No tag reachable from `HEAD` yet** → this is the first release:
      `v1.0.0`, unconditionally (no bump, nothing to diff against).
   3. **A tag exists** → reads the commits since it and derives a bump from
      their conventional-commit titles (commit/PR titles are already the
      changelog verbatim — AGENTS.md):
      - `feat:` → **minor**
      - `feat!:` / any type with `!` / a `BREAKING CHANGE:` footer → **major**
      - everything else (`fix:`, `chore:`, `build(deps):`, non-conventional) → **patch**
      - the **max** across all commits since the last tag wins
      - **no commits since the last tag** → nothing to release, exit cleanly
   4. Builds the library (`npm run build:lib`) with the derived version
      injected via the `APP_VERSION` env var.
   5. Publishes it:
      ```bash
      gh release create "vX.Y.Z" \
        dist-lib/odl-drawcustom-designer.js LICENSE \
        --title "vX.Y.Z" --generate-notes --target "$GITHUB_SHA"
      ```
      This single command **creates the `vX.Y.Z` tag** (pointed at the exact
      commit that was tested, via `--target "$GITHUB_SHA"`) **and** the
      GitHub release in one step — no separate tag push, no bump commit, no
      write back to `main` at all.

Because nothing is ever pushed to `main`, there is **no loop to guard
against** and the default `GITHUB_TOKEN` (`permissions: contents: write` in
the workflow) is sufficient — no PAT, no maintainer secret setup, no
anti-loop `if:` condition. This is a deliberate simplification over the
prior design (which bumped/committed/tagged/pushed and needed a
`RELEASE_PAT` purely to make the pushed tag re-trigger a second workflow).

**Fail loudly, always:** a red `npm test`/`npm run lint`, a `build:lib`
failure, or a `gh release create` failure (including a **tag/release that
already exists** — a real error, since every push derives a fresh version
from tag ancestry and a collision means something is actually wrong) all
exit the script non-zero and fail the run. There is no silent fallback
anywhere in this path. A failed run is retried cleanly via
[`workflow_dispatch`](#manual-retry-workflow_dispatch) once the underlying
problem is fixed.

### Manual retry (`workflow_dispatch`)

The workflow also accepts a manual trigger (Actions tab → "Auto Release" →
"Run workflow", or `gh workflow run auto-release.yml`) — this runs the
**exact same steps** against the current `main`, not a different path. Use
it to retry after a transient failure (npm registry hiccup, GitHub API
outage, etc.) without needing an empty commit to re-trigger the `push` event.

**Dependabot path:** a Dependabot PR that passes `checks` and gets merged
auto-releases a patch on the next `main` push (its title is a `build(deps):`
commit → patch bump) with zero further action. Enabling Dependabot
**auto-merge** is a separate maintainer decision this doesn't enable — to
turn it on:

- Repo → Settings → General → Pull Requests → check **"Allow auto-merge"**
  (one-time, repo-wide), then either:
  - per-PR: `gh pr merge --auto --squash <PR-number>` (or the "Enable
    auto-merge" button in the PR's UI) once its checks are green, or
  - a scheduled workflow that runs `gh pr merge --auto --squash` against
    open Dependabot PRs matching update-type labels (e.g. via
    `dependabot/fetch-metadata`) — more automation, not set up here.

Branch protection on `main` (if enabled) must allow the required `checks`
status check to gate the merge, same as any other PR.

No tag is ever created by an AI agent working on this repo, whether directly
or by pushing a commit that triggers this workflow's automatic path without
the maintainer's awareness — releases happen because the maintainer merges
to `main`, and that merge is the release decision.

**Status (UNVERIFIED):** this workflow has never run against a real push to
`main` — the first live run is this repo's actual `v1.0.0`. The decision
logic in `tools/autoRelease.ts` is fully covered by unit tests
(`tests/tools/autoRelease.test.ts`), and `npm run build:lib` is verified
locally, but the end-to-end `gh release create` path (permissions, artifact
upload, tag creation) is unverified until it runs for real.

## Future: AI-generated release notes

GitHub's auto-generated notes (`--generate-notes`) are the deliberate v1
choice — no extra conventions or tooling required. An AI-written narrative
changelog (summarizing the merged PRs since the previous tag) is an
anticipated upgrade path: the release script's structure leaves room to swap
in a different notes step later without restructuring the workflow itself.

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
