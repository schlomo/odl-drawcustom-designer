# Releasing (issue #23, issue #93, reworked 2026-07-29; npm publish added, issue #103, 2026-08-16)

The designer's release artifact is the **library build** (`npm run build:lib`,
[ADR-010](adr/ADR-010-ha-embed-mode.md)): one self-contained ESM file,
published two ways — as an **npm package** (`@schlomo/odl-drawcustom-designer`,
the **primary** consumer path going forward, [see below](#npm)) and as a
**GitHub release asset**, kept as a fallback for hosts that would rather
vendor a static file than add a package-manager dependency. The concrete
consumer — the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44)
— currently vendors the release asset directly inside
`custom_components/opendisplay/designer/frontend/`; issue #103's ruling names
npm as the fix for that path's cache-busting gap (`?v=` token missing the
vendored bundle in [PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)) — details in [npm](#npm) below.

## Version source: git tags, not package.json

`package.json`'s `version` field is pinned to **`0.0.0` forever**. Even
though the designer now publishes to npm ([below](#npm)), that publish uses
a **freshly generated** `package.json` assembled at staging time
(`tools/npmPackage.ts`) — never this tracked file, which stays
`private: true` and `0.0.0` and is never itself published. The **only**
source of truth for the designer's released version is its `vX.Y.Z` git tags. See
[Runtime version](#runtime-version) below for how that reaches the built
artifact.

## Semver policy

The **public surface that major-versions** is the embed API: `mount()`, the
`MountOptions`/`MountHandle`/`HostCapabilities`/`HostStates` shapes in
[`src/embed/types.ts`](../src/embed/types.ts), and the host data contract
documented in [`docs/embedding.md`](embedding.md) (states, displays, actions,
payload/theme behavior). Internal modules (`src/core/`, `src/ui/`,
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

- a `version` named export from the library entry
  (`import { version } from './odl-drawcustom-designer.js'`)
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
      - `feat!:` — or any type with a trailing `!` (e.g. `fix!:`) — or a
        `BREAKING CHANGE:` footer → **major**
      - everything else (`fix:`, `chore:`, `build(deps):`, non-conventional) → **patch**
      - the **max** across all commits since the last tag wins
      - **no commits since the last tag** → nothing to release, exit cleanly
   4. Builds the library (`npm run build:lib`) with the derived version
      injected via the `APP_VERSION` env var.
   5. Generates the release assets — `THIRD_PARTY.md` and
      `odl-drawcustom-designer.js.sha256` (`tools/thirdPartyNotices.ts`,
      `tools/releaseChecksum.ts`; [Artifact contents](#artifact-contents)
      below) — **and stages the npm package** into `dist-npm/`
      (`tools/stageNpmPackage.ts`; [npm](#npm) below). All of this is pure
      file assembly, no network call, so — like the checksum/third-party
      generation — it happens **before** the irreversible step next.
   6. Publishes the GitHub release:
      ```bash
      gh release create "vX.Y.Z" \
        dist-lib/odl-drawcustom-designer.js dist-lib/odl-drawcustom-designer.d.ts \
        LICENSE NOTICE dist-lib/THIRD_PARTY.md \
        dist-lib/odl-drawcustom-designer.js.sha256 dist-lib/odl-drawcustom-designer.d.ts.sha256 \
        --title "vX.Y.Z" --generate-notes --target "$GITHUB_SHA"
      ```
      This single command **creates the `vX.Y.Z` tag** (pointed at the exact
      commit that was tested, via `--target "$GITHUB_SHA"`) **and** the
      GitHub release in one step — no separate tag push, no bump commit, no
      write back to `main` at all. This is the one irreversible step in the
      whole script.
   7. Publishes the already-staged npm package (when `NPM_PUBLISH` is
      enabled) — the **only** step that runs after the release, since it
      is the only one that's genuinely a network call publishing the
      version the release just claimed. See [Partial-failure
      recovery](#partial-failure-recovery) below for what happens if this
      one step fails, and [npm](#npm) for full details.

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
anywhere in this path except the one described in [Partial-failure
recovery](#partial-failure-recovery) further below. A failed run is retried cleanly via
[`workflow_dispatch`](#manual-retry-workflow_dispatch) once the underlying
problem is fixed.

## Future: AI-generated release notes

GitHub's auto-generated notes (`--generate-notes`) are the deliberate v1
choice — no extra conventions or tooling required. An AI-written narrative
changelog (summarizing the merged PRs since the previous tag) is an
anticipated upgrade path: the release script's structure leaves room to swap
in a different notes step later without restructuring the workflow itself.

## Artifact contents

- `odl-drawcustom-designer.js` — the single self-contained ESM (React,
  styles, fonts inlined; see [`docs/embedding.md`](embedding.md#library-build))
- `odl-drawcustom-designer.d.ts` — ONE bundled declaration file for the whole
  embed surface (`mount`, `MountOptions`, `MountHandle`, the host data
  contract types — issue #122), generated by `vite-plugin-dts`
  (`bundleTypes: true`, powered by `@microsoft/api-extractor`) as part of the
  same `npm run build:lib` that produces the ESM. No `@types` package, no
  per-module `.d.ts` sprawl — see [`vite.lib.config.ts`](../vite.lib.config.ts)
  for the tool-choice rationale over `dts-bundle-generator`. Declaration
  generation failing (a type error anywhere reachable from the embed entry)
  fails `build:lib` itself (`tools/dtsDiagnostics.ts` wires
  `assertNoDtsDiagnostics` into the plugin's `afterDiagnostic` hook) — there
  is no missing-types package to accidentally ship.
- `odl-drawcustom-designer.js.sha256` / `odl-drawcustom-designer.d.ts.sha256`
  — sha256 checksums of the two files above (`tools/releaseChecksum.ts`),
  verifiable with `shasum -a 256 -c <file>.sha256` (issue #103; `-a 256`
  matters — bare `shasum -c` defaults to SHA-1 and silently mis-verifies a
  SHA-256 checksum file)
- `LICENSE` — this repository's Apache-2.0 license
- `NOTICE` — this repository's root [`NOTICE`](../NOTICE) (Apache-2.0 §4(c)
  attribution — closing the gap [PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
  couldn't close on its own: it vendors our bundle but had no NOTICE to carry)
- `THIRD_PARTY.md` — generated by `tools/thirdPartyNotices.ts` from the
  dependencies **actually bundled into the ESM**: the full **transitive
  closure** of this repo's own `package.json` `dependencies` map, walked
  through `package-lock.json`'s locked graph (production dependencies only —
  devDependencies are never followed). `vite.lib.config.ts` compiles every
  one of those, direct or transitive, into the bundle (no externals, no code
  splitting — [`docs/bundle-audit.md`](bundle-audit.md)), so the closure —
  not just the direct-deps list — is what can't drift from the real bundle
  composition (issue #113 review finding: a direct-deps-only list missed
  packages like `crelt`/`style-mod`/`w3c-keyname`, pulled in transitively by
  `@codemirror/view`). One row per package: installed version, license,
  link — sourced straight from that package's own `package.json` `license`
  field; the generator is **not** a heavyweight scanner and fails loudly if
  a bundled package has no license field. Distinct in scope from the
  hand-maintained [`docs/THIRD_PARTY.md`](THIRD_PARTY.md), which covers the
  whole repository (vendored docs, fonts, non-bundled upstream ecosystems) —
  this generated file is scoped to what's actually inside the published
  artifact.

All five non-checksum files are attached to the GitHub release and included
in the published npm package (the checksums are omitted from the npm package —
redundant once npm's own tarball integrity hash covers it).

## npm

> **Status: live on npm.**
> `@schlomo/odl-drawcustom-designer` is published to the registry — scoped
> under the `schlomo` npm org (maintainer update 2026-08-16 — the npm user
> `schlomo` was converted to an npm org, mirroring the GitHub org/user path),
> so there is no unscoped-name squatting risk to manage: the scope itself is
> already org-owned, and nothing outside that org can publish under it. Two
> versions exist: placeholder `0.0.1` (used to claim the name, never install)
> and `1.2.0` (first automated publish via Trusted Publishing with provenance,
> 2026-08-16). **Known gap: `1.2.0` shipped without a README** — this PR
> restores it; the next patch release carries it. `npm install @schlomo/odl-drawcustom-designer@^1.2.0` is live now; future releases auto-publish on every push to `main`.

Issue #103: alongside the GitHub release, the same build publishes to npm as
[`@schlomo/odl-drawcustom-designer`](https://www.npmjs.com/package/@schlomo/odl-drawcustom-designer)
(scoped under the `schlomo` npm org, 2026-08-16). This is the **primary**
consumer path going forward; the GitHub release asset (above) stays
available as a fallback.

### Why npm: cache invalidation, not just distribution

Ruling from issue #103 (2026-08-15): a host that vendors the release asset
directly has to hand-maintain its own cache-busting token, and the upstream
integration's current approach (a manual `?v=` query string,
[PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100))
already misses the vendored bundle. Consuming the designer from
`node_modules` instead means the *consumer's own* build/packaging step emits
a **content-hashed filename** for whatever it ships — the natural, already-
solved cache-invalidation mechanism — and the served asset can carry an
`immutable` cache header. `npm install @schlomo/odl-drawcustom-designer@x.y.z`
turns the update path into an ordinary version pin instead of a vendored
blob with a hand-maintained token.

### npm consumer story

```bash
npm install @schlomo/odl-drawcustom-designer@1.0.0   # pin an exact version
```

```js
import { mount, version } from '@schlomo/odl-drawcustom-designer'
```

The package ships the **same single self-contained ESM** as the GitHub
release asset — React and every other runtime dependency bundled in, no
peer dependencies to resolve — plus its bundled `odl-drawcustom-designer.d.ts`
(issue #122), `README.md`, `LICENSE`, `NOTICE`, and `THIRD_PARTY.md`.
`package.json`'s `types` field and `exports['.'].types` both point at the
declaration file, so `tsc`/editor tooling resolves it automatically on a
plain `import { mount } from '@schlomo/odl-drawcustom-designer'` — no
separate `@types` package to install. The shapes are also documented in
[`docs/embedding.md`](embedding.md#mount-api) and defined in
`src/embed/types.ts` for reference.

### Staging, generation, and publish (`tools/`, thin CI)

All logic lives in `tools/`, unit-tested (AGENTS.md, thin CI) — the workflow
only invokes `tools/autoRelease.ts`:

- **`tools/npmPackage.ts`** — builds a **fresh** `package.json` for the
  published package at staging time, not derived from the repo's own
  `package.json` (which stays `private: true`, pinned at `0.0.0` forever —
  [version source](#version-source-git-tags-not-packagejson) above is
  unchanged): name, the real derived version, `type: module`,
  `main`/`types`/`exports` pointing at the ESM and its bundled `.d.ts`
  (issue #122), `files`, `license: Apache-2.0`, `repository`/`homepage`,
  keywords. No `dependencies` field — the ESM is self-contained.
- **`tools/dtsDiagnostics.ts`** — the fail-loud gate `vite.lib.config.ts`
  wires into `vite-plugin-dts`'s `afterDiagnostic` hook: the plugin logs
  TypeScript diagnostics but exits 0 on its own, so this throws instead,
  failing `build:lib` (and therefore the whole release) on any type error
  reachable from the embed entry.
- **`tools/thirdPartyNotices.ts`** — generates `THIRD_PARTY.md` (see
  [Artifact contents](#artifact-contents) above).
- **`tools/releaseChecksum.ts`** — the `.sha256` checksum files (one each for
  the ESM and the `.d.ts`).
- **`tools/stageNpmPackage.ts`** — assembles a `dist-npm/` staging directory
  (the built ESM, its bundled `.d.ts`, generated `package.json`, `README.md`,
  `LICENSE`, `NOTICE`, `THIRD_PARTY.md`). `npm publish --dry-run` against this
  directory works on a laptop exactly as in CI (`runs on laptop or CI
  identically`) — no `GITHUB_SHA`/`GH_TOKEN` required, just
  `npm run build:lib` first.
- **`tools/npmPublish.ts`** — the `NPM_PUBLISH`-enabled check and
  job-summary warning helper (below).
- **`tools/npmRecovery.ts`** — the [partial-failure
  recovery](#partial-failure-recovery) decision (`planNpmRecovery`) and the
  read-only npm registry check (`checkNpmRegistryHasVersion`) used by the
  "nothing to release" skip path.

`tools/autoRelease.ts`'s `import.meta.main` block stages the npm package
**before** `gh release create` (pure file assembly, no network — see the
[release procedure](#release-procedure-automated-primary-issue-93) above)
and runs `npm publish --access public --provenance` against that staged
directory only **after** the GitHub release itself succeeds — the one step
that must stay post-release, since it publishes the version the release
just claimed.

### npm Trusted Publishing (OIDC) — no token, ever

**Reworked 2026-08-16** (maintainer ruling): npmjs.com now refuses to create
classic "Automation" access tokens on accounts without npm's own 2FA
enrollment, and its own docs point integrators at **Trusted Publishing**
instead — so this path was built directly on Trusted Publishing rather than
a long-lived npm access-token secret. There is no npm token anywhere in this repo, in CI,
or in any secret store: authentication is a per-run, short-lived credential
npm mints after verifying this exact GitHub Actions workflow's OIDC
identity token. Source: [npm Trusted Publishers
docs](https://docs.npmjs.com/trusted-publishers/), [GitHub npm Trusted
Publishing GA announcement](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/).

**What the workflow needs** (all present in `auto-release.yml`):

- `permissions: id-token: write` — mints the OIDC token npm exchanges for a
  publish credential. (`contents: write` is already broader than the
  `contents: read` Trusted Publishing itself needs, since this workflow
  also creates the GitHub release/tag.)
- `registry-url: 'https://registry.npmjs.org'` in the `actions/setup-node`
  step — no `NODE_AUTH_TOKEN`/`.npmrc` auth line; Trusted Publishing needs
  only the registry URL to target the OIDC exchange at.
- **npm CLI ≥ 11.5.1 and Node ≥ 22.14.0** — the documented minimum for
  Trusted Publishing. The runner's Node-bundled npm is not guaranteed to
  clear that floor, so the workflow runs `npm install -g npm@latest`
  explicitly before the release step (belt-and-suspenders; a no-op if the
  bundled version already qualifies).
- `--provenance` on the `npm publish` command. npm's docs say provenance is
  generated **automatically** under Trusted Publishing and the flag isn't
  required — but real-world reports (see [this write-up](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/))
  found that not fully reliable in practice, so it stays explicit here
  rather than depending on the implicit default.
- `--access public` — **mandatory**, not just habit, because the package is
  **scoped** (`@schlomo/odl-drawcustom-designer`, org `schlomo`, 2026-08-16):
  a scoped package defaults to *private* visibility on first publish, and
  omitting the flag would either fail (no paid private-package plan) or
  quietly publish it private ([docs.npmjs.com scoped-package
  docs](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)).
  Applies the same way whether the publish is manual or via Trusted
  Publishing — the flag controls package visibility, not the auth method.

**Scoped/org specifics** (this package is scoped under the `schlomo` npm
org): publishing under a scope requires the publishing identity — a human
account for the manual first publish, or the workflow's OIDC identity once
Trusted Publishing is configured — to have publish permission **in that
org**, same as any org-scoped package. No extra org-level toggle is needed
beyond that membership/permission; Trusted Publishing's whole point is that
the CI workflow's OIDC-derived credential satisfies an org's 2FA-for-publish
requirement without a human present for *that* publish — the maintainer's
own manual first publish ([One-shot setup](#one-shot-setup-completed) below,
done 2026-08-16) was the one step that still needed interactive 2FA, since
it's the human-authenticated bootstrap Trusted Publishing itself depends on.

**Gate: `vars.NPM_PUBLISH` repo variable, not a secret.** There's no token
lifecycle to manage under Trusted Publishing, so the staged-rollout gate is
a plain repository **variable** instead of a secret:

- `tools/npmPublish.ts`'s `shouldPublishToNpm()` is `true` only when
  `NPM_PUBLISH` is exactly `enabled` (trimmed). Anything else — unset,
  `disabled`, a typo — and the release script logs
  `NPM_PUBLISH repo variable not enabled — npm publish skipped (docs/releasing.md#npm)`
  and writes the same warning to the job summary — **prominent, but not a
  failure** — then the GitHub release completes exactly as it does today.
- Once `NPM_PUBLISH` is `enabled`, that safety net is gone: a real publish
  failure (trusted publisher not configured, a name/version collision, a
  registry outage) fails the run loudly, same as every other step in this
  script. Because that failure happens after the GitHub release already
  exists, the next run's skip path recovers it automatically — see
  [Partial-failure recovery](#partial-failure-recovery) below.

Claiming the package, configuring the trusted publisher, and setting this
repo variable are all **done** — see [One-shot setup](#one-shot-setup-completed)
at the bottom of this file for how, and for how to redo this against a new
package.

## Consumer story

**npm (primary):** see [above](#npm).

**GitHub release asset (fallback):** the OpenDisplay HA integration pins a
release (tag or version number), downloads that release's
`odl-drawcustom-designer.js` asset, and vendors it as a static file the same
way it already vendors `js-yaml.mjs` — served from
`custom_components/opendisplay/designer/frontend/` and cache-busted with its
own build token. Either path can read the exposed `version` (library export
or `MountHandle.version`) to log/report which designer build is embedded,
e.g. in diagnostics or a support panel.

## Partial-failure recovery

The `npm publish` step (release-procedure step 7 above) is the only one that
runs **after** `gh release create` has already made the `vX.Y.Z` tag and
release irreversible. If it fails there — trusted publisher not configured,
npm registry outage, the job killed mid-step — the release itself is
already real, but that version never reached npm.

**What happens:** the *next* `tools/autoRelease.ts` run (any trigger: a
later `main` push, or `workflow_dispatch`) lists tags, sees the
just-published tag is still the latest, finds zero commits since it, and
takes the "nothing to release" skip path. Unpatched, that would exit
cleanly and never revisit the stranded version — this is exactly the "no
silent fallback" exception flagged above. Instead, when `NPM_PUBLISH` is
enabled, the skip path asks `tools/npmRecovery.ts` a read-only question:
*is the latest tag's version actually on the npm registry?*

- **Registry check is a 404 (not published) and the version is
  `>= v1.1.0`** (the [npm-publish cutoff](#npm-publish-cutoff) — see below) →
  **recovers**: rebuilds the library with `APP_VERSION` set to that exact
  version, re-stages `dist-npm/`, and runs `npm publish` for it, logging
  `recovering unpublished npm version vX.Y.Z` and writing a job-summary
  note. It never re-runs `gh release create` — the release/tag already
  exist and are left untouched.
- **Registry check finds the version already published** → ordinary skip,
  nothing to do.
- **Registry check itself fails** (network down, a non-404 error status) →
  fails the run loudly, same as any other step. A registry outage must
  never be misread as "not published".
- **The latest tag's version is below the cutoff** (`v1.0.0`–`v1.0.4`,
  released before npm publishing existed) → always an ordinary skip, never
  recovered — see [cutoff](#npm-publish-cutoff) below.

The decision itself (`planNpmRecovery` in `tools/npmRecovery.ts`) is a pure
function, unit-tested in `tests/tools/npmRecovery.test.ts`: given the latest
version, whether npm publishing is enabled, and whether the registry has
that version, it returns `skip` or `recover` plus the reason. The registry
lookup (`checkNpmRegistryHasVersion`) is a separate async function so the
decision itself needs no network mocking.

### npm-publish cutoff

`v1.0.0`–`v1.0.4` were released before this npm-publish feature (issue #103)
existed at all — their GitHub releases carry no npm-related assets and were
never meant to reach npm, so recovery must never retroactively publish them.
The cutoff is `NPM_PUBLISH_CUTOFF_VERSION = '1.1.0'` in
`tools/npmRecovery.ts`: the latest tag at the time npm publishing was added
is `v1.0.4`, and this feature's own commit is `feat:`-scoped (minor bump),
so the first version that can ever carry an npm publish is `v1.1.0`. It's a
literal constant, not derived from a tag lookup, so the cutoff can never
silently drift if a later release renumbers something.

**Manual fallback** (for completeness — not the tested/normal path): if
automatic recovery on the next run isn't desirable and you need to publish
a specific version to npm right away, stage and publish it by hand from a
checkout of that tag, reusing the same tested `tools/` functions the
release script itself uses:

```bash
git checkout vX.Y.Z
APP_VERSION=X.Y.Z npm run build:lib

node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageNpmPackage } from './tools/stageNpmPackage.ts';
import {
  bundledDependencyNames,
  collectBundledDependencyInfo,
  generateThirdPartyMarkdown,
  resolveTransitiveRuntimeDependencyPaths,
} from './tools/thirdPartyNotices.ts';

const repoRoot = process.cwd();
const distLibJsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.js');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
const resolvedPaths = resolveTransitiveRuntimeDependencyPaths(packageLock, bundledDependencyNames(pkg));
const thirdPartyMarkdown = generateThirdPartyMarkdown(collectBundledDependencyInfo(resolvedPaths, repoRoot));
stageNpmPackage({
  version: 'X.Y.Z',
  repoRoot,
  distLibJsPath,
  stagingDir: join(repoRoot, 'dist-npm'),
  thirdPartyMarkdown,
});
"

cd dist-npm && npm login && npm publish --access public
```

No `--provenance` here — provenance attestation only works from a supported
CI provider (GitHub Actions/GitLab CI), not a local `npm publish`; this
manual path authenticates the ordinary way (`npm login`, 2FA as usual), not
via Trusted Publishing. (Verified locally with `npm publish --dry-run` — the
tarball contains exactly the ESM, `package.json`, `README.md`, `LICENSE`, `NOTICE`,
`THIRD_PARTY.md`.) In practice, letting the next scheduled/`workflow_dispatch`
run recover it automatically is simpler and is the tested path — this
manual fallback exists only for an urgent one-off.

## Manual retry (`workflow_dispatch`)

The workflow also accepts a manual trigger (Actions tab → "Auto Release" →
"Run workflow", or `gh workflow run auto-release.yml`) — this runs the
**exact same steps** against the current `main`, not a different path. Use
it to trigger a release check without waiting for the next `main` push —
including forcing an immediate [partial-failure recovery
check](#partial-failure-recovery) after a transient `npm publish` failure
(npm registry hiccup, GitHub API outage, etc.), rather than waiting for the
next real push to `main` to pick it up.

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

**Status (verified):** the workflow ran for real and produced `v1.2.0`
(2026-08-16) with Trusted Publishing provenance. The decision logic in
`tools/autoRelease.ts` is covered by unit tests (`tests/tools/autoRelease.test.ts`),
and the end-to-end path (GitHub release creation, npm publish via Trusted Publishing
with OIDC provenance, tag creation) is verified and live.

## One-shot setup (completed)

Everything in this section happened **once**, to bring npm publishing online
for `@schlomo/odl-drawcustom-designer`. It's kept here as a reference — and
as the recipe for redoing this against a **new** package (a rename, a fork,
a different scope) — not as a repeated maintainer action. Day-to-day, none
of this runs again: ordinary releases are fully described by
[Release procedure: automated](#release-procedure-automated-primary-issue-93)
and [npm](#npm) above.

**Maintainer runbook, in order** (each step is a one-time maintainer action,
never something an AI agent does unprompted) — **all three steps below are
done, completed 2026-08-16:**

1. **Claim the package — manual first publish (done 2026-08-16).** A
   brand-new, never-published package name **cannot** be claimed via
   Trusted Publishing directly, and its settings page doesn't exist until
   step 2 can even be attempted: npm's Trusted Publisher configuration
   lives on the package's own settings page (`npmjs.com` → Packages →
   *your package* → Settings → Trusted Publishing), which **only appears
   once the package has been published at least once** — this is a hard
   step-ordering requirement, not a suggestion.

   At the time this ran, **no tag carried the npm-publish tooling yet** —
   it was still landing on this branch — so this wasn't a checkout of a
   real release tag. It was a normal, manually authenticated `npm publish`
   from a maintainer machine (`npm login`, 2FA as usual, publishing under
   the `schlomo` org's own scope), built straight from the branch/main head
   with a deliberately-low **placeholder version**, `0.0.1`:
   ```bash
   APP_VERSION=0.0.1 npm run build:lib
   # …stage dist-npm/ as in the manual-fallback script above (Partial-failure recovery)…
   cd dist-npm && npm login && npm publish --access public
   ```
   **Why a placeholder version, not the real first release version:** npm
   never lets a version number be republished once it's claimed. Hand-
   publishing the *real* first release version (e.g. the eventual `v1.0.0`)
   manually would permanently block CI from ever publishing that exact
   version through Trusted Publishing with provenance — the version would
   already exist on the registry, unattested. `0.0.1` claims the package
   name/scope without spending a real version number, so the first *real*
   version ships through CI, with provenance, exactly as designed.

   **To redo this for a new package** (a rename, a fork, a different
   scope): same recipe — a low placeholder version, built and published by
   hand from whichever branch has the npm-publish tooling.
2. **Configure the trusted publisher (done).** On `npmjs.com` → Packages →
   `@schlomo/odl-drawcustom-designer` → Settings → Trusted Publishing → add
   a publisher → **GitHub Actions** → organization/user `schlomo`,
   repository `odl-drawcustom-designer`, workflow filename
   `auto-release.yml` (no environment — this workflow doesn't use a GitHub
   Actions environment).
3. **Set the repo variable (done).** Repo → Settings → Secrets and
   variables → Actions → **Variables** tab (not Secrets) → New repository
   variable → name `NPM_PUBLISH`, value `enabled`.
4. Done. The next push to `main` that produces a release publishes to npm
   automatically — tokenless, OIDC-authenticated, provenance-attested — no
   code or workflow change needed.

**If Trusted Publishing isn't configured yet but `NPM_PUBLISH` is
`enabled` anyway** (relevant when redoing this runbook for a new package):
npm does not surface a clear "trusted publisher not configured" diagnostic.
Reports from real usage show a generic `404 Not Found` or an
`ENEEDAUTH`/"please log in" error instead — the same errors npm shows for an
actually-missing package or a genuinely unauthenticated publish (see
[npm/cli#9088](https://github.com/npm/cli/issues/9088)). The run still fails
loudly (`npm publish` exits non-zero, same as any other publish error), it's
just not self-diagnosing — check the package's Trusted Publishing settings
and the workflow filename/repo match exactly, then retry via
[`workflow_dispatch`](#manual-retry-workflow_dispatch).

**Status:** `npm publish --dry-run` against a locally staged package was run
and verified before any of this (tarball contents: exactly the ESM,
`package.json`, `README.md`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md`; correct
name/version/size) — `--dry-run` needs no auth at all, so this worked
identically on a laptop and in CI. Step 1 above then really published
(`0.0.1`, manually, 2FA-authenticated — not a dry run) to claim the package.
The full CI path — `npm publish --access public --provenance` run by
Trusted Publishing (OIDC exchange, provenance attestation) — shipped `1.2.0`
(2026-08-16), the first automated release with provenance. **Known gap:
`1.2.0` lacks the README** (this PR restores it for the next patch).
