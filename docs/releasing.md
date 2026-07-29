# Releasing (issue #23, issue #93)

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

## Release procedure: automated (primary, issue #93)

**main = release.** Main is always stable — every merge is gated by the
`checks` job in [`pages.yml`](../.github/workflows/pages.yml) — so every
push to main is a release candidate. On each push,
[`.github/workflows/auto-release.yml`](../.github/workflows/auto-release.yml)
runs [`tools/autoRelease.ts`](../tools/autoRelease.ts), which:

1. Reads the latest `vX.Y.Z` tag reachable from `HEAD` and the commits since it.
2. Derives a semver bump from those commits' conventional-commit titles
   (commit/PR titles are already the changelog verbatim — AGENTS.md):
   - `feat:` → **minor**
   - `feat!:` / any type with `!` / a `BREAKING CHANGE:` footer → **major**
   - everything else (`fix:`, `chore:`, `build(deps):`, non-conventional) → **patch**
   - the **max** across all commits since the last tag wins
3. Bumps `package.json` + `package-lock.json` (`npm version --no-git-tag-version`),
   commits as `chore(release): vX.Y.Z`, tags `vX.Y.Z`, and pushes both the
   commit and the tag.
4. The pushed tag triggers the existing
   [`.github/workflows/release.yml`](../.github/workflows/release.yml)
   (issue #23, unchanged) — see below for what that does. It stays the
   **single** mechanism that publishes a GitHub release; this workflow only
   ever produces the tag push that feeds it.

**First release (no tags yet):** with no `vX.Y.Z` tag reachable from `HEAD`,
`tools/autoRelease.ts` treats `package.json`'s current version as the
release — it tags `HEAD` as `vX.Y.Z` **as-is, with no bump and no bump
commit** (nothing changed to commit). Every push after that has a tag to
diff against, so the normal bump-from-commits path applies from then on.
This repo's first automated run will tag the current `1.0.0` unchanged.

**Loop guard:** the bump commit (`chore(release): vX.Y.Z`) must never
itself trigger another bump. Two layers:
- `tools/autoRelease.ts`'s `planRelease()` checks `HEAD`'s commit subject
  first and skips unconditionally if it matches `^chore\(release\):`
  (unit-tested in `tests/tools/autoRelease.test.ts`).
- The workflow's job `if:` also skips when
  `github.event.head_commit.message` starts with `chore(release):`, so an
  unauthenticated run (see PAT note below) doesn't even start.

**Required setup — `RELEASE_PAT` secret:** GitHub Actions does not
re-trigger workflows from pushes made with the default `GITHUB_TOKEN` (a
documented anti-loop measure). If `auto-release.yml` pushed the release tag
using the default token, `release.yml`'s `on: push: tags: v*.*.*` would
**never fire** — the tag would exist, but no release would ever publish.
To avoid that, `auto-release.yml`'s checkout step authenticates with a
repository secret PAT instead of the default token. The maintainer must
create this once:

1. GitHub → Settings (personal) → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token.
2. Resource owner: this repo's owner. Repository access: **only this
   repository**. Permissions: **Contents: Read and write** (that's the only
   permission `tools/autoRelease.ts` needs — it reads tags/log and pushes a
   commit + tag).
3. Repo → Settings → Secrets and variables → Actions → New repository
   secret → name it `RELEASE_PAT`, paste the token value.

Without this secret, `secrets.RELEASE_PAT` resolves to an empty string,
checkout configures no push credentials, and the `git push` steps in
`tools/autoRelease.ts` fail loudly — not a silent no-op.

**Dependabot path:** with this in place, a Dependabot PR that passes
`checks` and gets merged auto-releases a patch (its title is a
`build(deps):` commit → patch bump) with zero further action. Enabling
Dependabot **auto-merge** is a separate maintainer decision this issue
does not enable — to turn it on:

- Repo → Settings → General → Pull Requests → check **"Allow auto-merge"**
  (one-time, repo-wide), then either:
  - per-PR: `gh pr merge --auto --squash <PR-number>` (or the "Enable
    auto-merge" button in the PR's UI) once its checks are green, or
  - a scheduled workflow that runs `gh pr merge --auto --squash` against
    open Dependabot PRs matching update-type labels (e.g. via
    `dependabot/fetch-metadata`) — more automation, not set up here.

Branch protection on `main` (if enabled) must allow the required `checks`
status check to gate the merge, same as any other PR.

## Release procedure: manual tag (fallback / escape hatch)

If the automated path above is unavailable (e.g. `RELEASE_PAT` isn't
configured yet, or the maintainer wants to cut a release outside the normal
commit flow), tag and push by hand:

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
   - publishes a GitHub release named after the tag using the GitHub CLI
     (`gh release create --generate-notes`), with **GitHub's auto-generated
     release notes** (commits since the previous tag) — the simplest changelog
     option, no extra conventions or tooling required
   - attaches the artifact: `dist-lib/odl-drawcustom-designer.js` and the
     repository's `LICENSE`

No tag is ever pushed by an AI agent working on this repo — only the
maintainer cuts a release, whether via this manual path or by reviewing
what the automated path is about to do.

**Status (UNVERIFIED):** neither workflow has ever run against a real push
or tag — `release.yml` hasn't published a release yet, and
`auto-release.yml` hasn't run on a real push to main (it also depends on
the `RELEASE_PAT` secret existing, which this change does not create).
`tools/releaseVersion.ts` and `tools/autoRelease.ts`'s decision logic are
both covered by unit tests, and `npm run build:lib` is verified locally.

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
