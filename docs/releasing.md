# Releasing (issue #23, issue #93; npm publish, issue #103, 2026-08-16; unified single-version pipeline, 2026-09-01)

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
[Runtime version](#runtime-version--one-value-one-define) below for how
that reaches the built artifact.

## Semver policy — and "every push releases"

The **public surface that major-versions** is the embed API: `mount()`, the
`MountOptions`/`MountHandle`/`HostDisplaySpec`/`HostStates` shapes in
[`src/embed/types.ts`](../src/embed/types.ts), and the host data contract
documented in [`docs/embedding.md`](embedding.md) (states, displays, actions,
payload/theme behavior). Internal modules (`src/core/`, `src/ui/`,
anything not re-exported from `src/embed/index.ts`) are not part of the
versioned surface and can change freely.

- **Major** — a breaking change to the mount API or host data contract (a
  removed/renamed export or field, a changed method signature, a
  display-spec/states field whose meaning changes). Derived from a `!` after
  the conventional-commit type (`feat!:`, `fix(embed)!:`) or a
  `BREAKING CHANGE:` footer.
- **Minor** — additive, backwards-compatible surface (new optional option,
  new `HostDisplaySpec` field, new `MountHandle` method). Derived from
  `feat:`.
- **Patch** — **everything else**: `fix:`, `docs:`, `chore:`,
  `build(deps):`, a revert, a non-conventional subject.
- The **max** across all commits since the last tag wins.
- **First release is `v1.0.0`** — no `0.x` pre-release phase; the mount API
  is considered stable from the first tag, and major/minor/patch above
  apply immediately.

**Every push to `main` releases at least a patch** (maintainer ruling
2026-09-01: *"non-code pushes should bump patch IMHO, why not? more
consistent and doesn't cost"*). There is no commit shape that reaches `main`
and produces no release — a docs-only or chore-only push ships a patch. The
rule lives in `bumpForCommit`/`planRelease`
([`tools/releaseVersion.ts`](../tools/releaseVersion.ts)) and is unit-tested
in [`tests/tools/releaseVersion.test.ts`](../tests/tools/releaseVersion.test.ts).

## Runtime version — one value, one define

The designer's version is baked in at build time from an `APP_VERSION`
environment variable ([`tools/version.ts`](../tools/version.ts) +
[`tools/buildDefines.ts`](../tools/buildDefines.ts), following the `vitest:`
short-circuit pattern used for the git revision/branch labels) and exposed
three ways:

- a `version` named export from the library entry
  (`import { version } from './odl-drawcustom-designer.js'`)
- a `version` field on the `MountHandle` returned by `mount()`
- the version label in the app header (`APP_HEADER_VERSION`,
  [`src/core/buildInfo.ts`](../src/core/buildInfo.ts)), linked to that
  release's GitHub release page

**`APP_VERSION` is the only version define.** Every build in a release run —
the published library *and* the standalone site — bakes the same string,
because the pipeline below computes it once and passes it to both
([the pipeline](#release-pipeline)). Only that pipeline sets `APP_VERSION`;
every other build (local dev, the `checks` gate, GH Pages PR previews)
has none set and reports `0.0.0-dev` — the one documented silent fallback in
this codebase (AGENTS.md, "fail loudly" exception), never an error.

`src/core/buildInfo.ts`'s `isReleasedVersion()` is what separates the two
cases: a plain `X.Y.Z` is a real release and becomes the header's version
label; `0.0.0-dev` (and Vitest's short-circuited `'test'`) resolve
`APP_HEADER_VERSION` to the **empty string**, which the header reads as
"show branch + SHA / `PR #n` instead". A wrong-looking version label is
worse than none, so nothing is ever guessed.

**Deleted: the predicted site version.** Until 2026-09-01 there was a second
define, `VITE_SITE_VERSION` / `APP_SITE_VERSION`, fed by a
`tools/siteVersion.ts` that re-ran the bump algorithm to *predict* the
version Auto Release was about to publish. It existed only because the Pages
production build and Auto Release both triggered on the same push and ran
**concurrently**, so the new tag did not exist yet while the site was
building. The maintainer's verdict was to remove the race rather than
predict around it: the pipeline below computes the version once and hands it
to both publishes, so `tools/siteVersion.ts`, the second define, and the
"predicted vs authoritative" distinction are all gone.

**PR previews are unchanged.** The `preview` job never sets `APP_VERSION`,
so no PR preview ever shows a version label — it renders
`PR #173 · feat/site-release-version · abc1234` exactly as before.

### Embedded / library-build header version

A library build vendored into a host — e.g. the OpenDisplay HA integration's
panel — shows the same version label the standalone site does, because both
carry the same `APP_VERSION`. That was the fix in
[PR #182](https://github.com/schlomo/odl-drawcustom-designer/pull/182) for
the maintainer-reported bug (*"the embedded designer in HA doesn't show the
version but a SHA"*), and collapsing the two defines into one is what makes
it structural rather than a fallback chain: there is no build shape left in
which the header has a release version available and fails to use it.

The version link always targets that version's GitHub release page
(`githubReleaseUrl`) — there is only one version, so there is no separate
"library version" link target to design.

**Only fully confirmed once a release is vendored into a real host** —
covered here by Vitest tests (`tests/core/buildInfo.test.ts`,
`tests/ui/components/app-header-library-version.test.tsx`), not by an actual
HA-panel embed; that needs the next OpenDisplay HA integration round to pin
a release built after this landed.

**PR preview header shape** (maintainer ruling 2026-08-31, on PR #173's own
preview): the PR number and the full branch name are rendered as VISIBLE
TEXT — `PR #173 · feat/site-release-version · abc1234` — not hidden behind
a hover tooltip. Earlier this label ran `formatGitBranchLabel`'s fixed
12-character leaf truncation (meant for the narrow-width fallback, not the
everyday case), which showed an unreadable stub like `site-releas...` with
the PR number visible only on hover. The hover tooltip (`PR #173 · Branch:
feat/site-release-version`) is unchanged - that phrasing is what the
maintainer liked - but the literal word "Branch:" is dropped from the
visible text as redundant once "PR #n" and the name sit side by side.

The branch name is the one flexible segment: it and its containing link
carry `min-w-0` + Tailwind's `truncate`, and are never `shrink-0`, so a
long branch name (e.g. `chore/deps-bump-npm-version-updates-group`)
degrades via CSS ellipsis - continuously, down to effectively nothing at
the narrowest widths - instead of ever widening the header row (AGENTS.md's
horizontal-scrollbar bug class; ADR-016 single-row responsive layout). "PR
#n" itself stays fixed-width/non-breaking. The full, untruncated branch
name always reaches the DOM and the tooltip regardless of how it renders
visually - see `tests/ui/components/app-header-pr-preview-long-branch.test.tsx`.

## Release pipeline

**main = release.** Main is always stable — every merge is gated by the
`checks` job in [`pages.yml`](../.github/workflows/pages.yml) — so every push
to main is a release. A single workflow,
[`.github/workflows/auto-release.yml`](../.github/workflows/auto-release.yml),
runs on every push to `main` (and via manual `workflow_dispatch` — see
[Manual retry](#manual-retry-workflow_dispatch), the *same* path, not a
separate one).

Its shape is **one computation, then a fan-out**:

```
version  ── computes the version ONCE and creates the tag + GitHub release
   ├── npm    ── publishes that version to npm
   └── pages  ── builds and deploys the standalone site at that version
```

`npm` and `pages` both declare `needs: version` and **neither depends on the
other**, so GitHub Actions runs them in parallel and a failure in one cannot
demote the other (maintainer ruling 2026-09-01: *"each has its own value and
a failure doesn't demote the other"*). Both bake the **same** `APP_VERSION`,
which by the time they start is a published fact — a tag that exists — not a
prediction.

> **Do not rename `auto-release.yml`.** npm Trusted Publishing is configured
> on npmjs.com against the workflow **filename**
> ([One-shot setup](#one-shot-setup-completed), step 2). Renaming the file
> breaks publishing until that setting is updated. The workflow's display
> name (`Release`) is free to change; the filename is not.

### 1. `version` — compute once, tag once

The only job with `fetch-depth: 0` (it needs every `vX.Y.Z` tag reachable
from HEAD plus the full log since the latest one; the publish jobs only
build, so they keep the default shallow checkout).

It is also the only job with **`filter: blob:none`** — a blobless partial
clone: every commit and tree, but a historical file's *contents* only if
something asks for one. Nothing in this job does. `git tag --list --merged
HEAD` and `git log --format=%B` read refs and commit objects; the gate and
`build:lib` read the checked-out working tree, whose blobs
`actions/checkout` downloads regardless; `gh release create` talks to the
API and uploads locally built files. The saving is therefore the **history**
of file contents, not the working tree: on this repo a full clone's object
store measures ~224 MB against ~4 MB blobless, while the checked-out tree
costs the same ~7 MB either way.

> **Never put `filter: blob:none` on the `pages` job.**
> [PR #174](https://github.com/schlomo/odl-drawcustom-designer/pull/174)
> added it to the old `production` job and **broke production deploys**:
> `JamesIves/github-pages-deploy-action` runs its own
> `git fetch --no-recurse-submodules --depth=1 origin gh-pages` inside that
> same checkout to build its deploy worktree, and a promisor clone cannot
> satisfy it —
> ```
> fatal: missing blob object '871af9f8af779d0ec4cb6cc7c44f023aab620395'
> error: remote did not send all necessary objects
> ##[error]The cwd: .../github-pages-deploy-action-temp-deployment-folder does not exist!
> ```
> In run `33432789880` steps 1–9 were all green and only `Deploy production`
> failed, so the site silently stopped deploying while every PR check stayed
> green. Reverted in
> [PR #176](https://github.com/schlomo/odl-drawcustom-designer/pull/176).
> The filter is usable again **only** because this restructure moved the
> deploy into a job of its own — the `version` job never runs that action.

1. `npm ci`, then `npm test` and `npm run lint` — **the release gate**. It
   runs once, here, before anything irreversible; both publish jobs `needs:`
   this job, so neither can publish past a red gate. (This also replaced the
   duplicate lint/test run the old Pages `production` job did.)
2. [`node tools/releaseVersion.ts`](../tools/releaseVersion.ts) — the one
   version computation. It:
   1. Lists `vX.Y.Z` tags **reachable from `HEAD`**
      (`git tag --list 'v*.*.*' --merged HEAD --sort=-v:refname`) and takes
      the newest as the latest release. The `--merged HEAD` ancestry check
      matters: without it, a stray `vX.Y.Z` tag pushed on some unmerged
      branch could sort ahead by version and silently become the base for
      the next bump.
   2. Derives one of three outcomes — **all three carry a real version**;
      there is no "nothing to release" state any more:
      - **first-release** — no tag reachable from HEAD: `1.0.0`.
      - **bump** — commits since the latest tag: the
        [semver policy](#semver-policy--and-every-push-releases) above, at
        least a patch, always.
      - **already-released** — no commits since the latest tag (a
        `workflow_dispatch`, or a re-run): HEAD *is* that release, so its
        version flows downstream unchanged and no new tag is created.
   3. Writes `version`, `tag` and `create-release` to `$GITHUB_OUTPUT`
      ([`tools/githubOutput.ts`](../tools/githubOutput.ts)) and prints the
      same decision to the log. **Runs identically on a laptop:** `node
      tools/releaseVersion.ts` in a checkout prints e.g.
      `v3.4.1 (bump) — 2 commit(s) since v3.4.0 — bump: patch`.
3. [`node tools/createRelease.ts`](../tools/createRelease.ts), with
   `APP_VERSION` and `CREATE_RELEASE` from step 2's outputs — it **never
   computes a version of its own**, and fails loudly if either is missing or
   malformed. It:
   1. Builds the library (`npm run build:lib`) with that version injected.
   2. Generates the release assets — `THIRD_PARTY.md` and the two `.sha256`
      files ([`tools/thirdPartyNotices.ts`](../tools/thirdPartyNotices.ts),
      [`tools/releaseChecksum.ts`](../tools/releaseChecksum.ts);
      [Artifact contents](#artifact-contents)). Pure file assembly, no
      network, so it happens **before** the irreversible step next.
   3. When `create-release` is `true`, publishes the GitHub release:
      ```bash
      gh release create "vX.Y.Z" \
        dist-lib/odl-drawcustom-designer.js dist-lib/odl-drawcustom-designer.d.ts \
        LICENSE NOTICE dist-lib/THIRD_PARTY.md \
        dist-lib/odl-drawcustom-designer.js.sha256 dist-lib/odl-drawcustom-designer.d.ts.sha256 \
        --title "vX.Y.Z" --generate-notes --target "$GITHUB_SHA"
      ```
      This single command **creates the `vX.Y.Z` tag** (pointed at the exact
      commit that was gated, via `--target "$GITHUB_SHA"`) **and** the
      GitHub release in one step — no separate tag push, no bump commit, no
      write back to `main` at all. When `create-release` is `false` the
      artifacts above are still built (the npm job consumes them) and
      nothing is created.
4. Uploads `dist-lib/` as a workflow artifact, so the npm job publishes the
   **exact bytes** attached to the release rather than rebuilding them —
   which also means the release's `.sha256` assets describe the npm
   tarball's contents.

**Why tag/release creation sits here, before the fan-out.** `gh release
create` is the one irreversible step in the pipeline, and the version's
identity has to exist before anything claims to publish it. Putting it in
the `version` job means:

- both publish jobs start from a version that is already a fact, so neither
  has to know what the other did;
- neither publish can "win" a version the other never got — the failure
  modes are per-publish and independent, exactly as ruled;
- a re-run recomputes `already-released` for that same tag and creates
  nothing, so the whole job is idempotent.

Putting it *after* both publishes (a `finalize` job) would mean publishing
to npm a version with no tag behind it, and would couple the two publishes
back together through a shared successor. Putting it *inside* the npm job
would make a Pages-only re-run impossible and make the release hostage to
the registry.

Because nothing is ever pushed to `main`, there is **no loop to guard
against** and the default `GITHUB_TOKEN` (`contents: write` on the `version`
and `pages` jobs) is sufficient — no PAT, no maintainer secret setup, no
anti-loop `if:` condition.

### 2a. `npm` — publish the library

Shallow checkout (for `LICENSE`/`NOTICE`/`README.md` and the `tools/`
scripts), `npm ci`, `npm install -g npm@11.19` (the Trusted Publishing
floor), download the `dist-lib/` artifact, then
[`node tools/publishNpm.ts`](../tools/publishNpm.ts) with `APP_VERSION` from
the `version` job. It asks the registry whether that exact version is
already published and publishes only if not — see
[Failure and recovery](#failure-and-recovery) and [npm](#npm).

### 2b. `pages` — deploy the standalone site

Shallow checkout, `npm ci`, `npm run build:site` with `APP_VERSION` from the
`version` job, then `JamesIves/github-pages-deploy-action` onto `gh-pages`.
No lint/test here — the `version` job already gated this commit.

This job keeps the **`gh-pages-push` concurrency group** it inherited from
the old `production` job. Concurrency groups are repository-wide, so it
still serializes against `pages.yml`'s `preview` job: when two deploys land
on `gh-pages` within seconds, GitHub's legacy Pages build of the first
commit gets superseded mid-build and reports "Page build failed". Queuing
(`cancel-in-progress: false`) means no deploy is ever lost. Do not remove or
rename that group.

**Fail loudly, always:** a red `npm test`/`npm run lint`, a `build:lib`
failure, or a `gh release create` failure (including a **tag/release that
already exists** — a real error, since the `version` job reports
`create-release: false` for any tag reachable from HEAD, so a collision
means the tag was created somewhere off HEAD) all exit non-zero and fail the
run. The only documented exception is the `NPM_PUBLISH` gate (see
[npm](#npm)).

**`build:lib` can fail on code `npm test`/`npm run lint`/`npm run build`
consider clean (issue #122 review finding).** Those three all run TypeScript
with `noEmit: true` — they never invoke declaration emission, so they never
see `getDeclarationDiagnostics()` (TS4094 "anonymous class type may not be
private/protected", TS2742, TS4023, …). `build:lib`'s declaration step
(`vite.lib.config.ts`'s `dts()` plugin) does emit declarations for real, and
`tools/dtsDiagnostics.ts`'s `afterDiagnostic` gate fails the build on any
diagnostic it finds — including ones in `src/ui`, since `mount.tsx` pulls the
whole React shell into the same TypeScript program even though the bundled
`.d.ts` only publishes the embed surface (see `vite.lib.config.ts`'s
file-level comment for the full mechanics). This class of bug is therefore
invisible to `npm test && npm run lint && npm run build` and only surfaces on
`npm run build:lib` — a real instance shipped in
[`src/ui/editor/yamlTemplatePreview.ts`](../src/ui/editor/yamlTemplatePreview.ts)
during issue #122's own development. **Resolved (maintainer ruling
2026-08-18):** [`AGENTS.md`](../AGENTS.md)'s pre-finish gate line grew
`&& npm run build:lib`, so this class is caught locally before any push;
CI's `checks` job additionally runs `npm run verify:types` (which itself
runs `build:lib`) on every PR.

## Future: AI-generated release notes

GitHub's auto-generated notes (`--generate-notes`) are the deliberate v1
choice — no extra conventions or tooling required. An AI-written narrative
changelog (summarizing the merged PRs since the previous tag) is an
anticipated upgrade path: `tools/createRelease.ts`'s structure leaves room
to swap in a different notes step later without restructuring the pipeline.

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
  is no missing-types package to accidentally ship. A second gate
  (`tools/dtsArtifactChecks.ts`, the same plugin's `afterBuild` hook) inspects
  the actual emitted bytes for problems a clean compile alone wouldn't catch
  — see below.

  **Known limitation — `@microsoft/api-extractor`'s bundled TypeScript
  version:** the bundling step runs its own pinned TypeScript (5.9.3 at the
  time of writing) rather than this repo's own compiler (`~6.0.2`), and logs
  a one-line warning about the mismatch on every `build:lib` run. This is
  cosmetic in the case that matters: `tools/dtsArtifactChecks.ts`'s
  no-external-imports check independently catches the one *breaking*
  consequence a compiler-version skew inside API Extractor could produce (a
  type it can't safely inline emitted as an `import` instead — the "zod"
  scenario in a PR #154 review), so no further action is needed here beyond
  this note. That gate covers breaking consequences only: the skew can still
  make API Extractor silently emit a non-exported `declare type` for a type
  that's reachable from a public field — a cosmetic/DX degradation
  (consumers can't name that type) with no warning and nothing in this repo's
  checks that catches it.
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
only invokes `tools/releaseVersion.ts`, `tools/createRelease.ts` and
`tools/publishNpm.ts`, one per job:

- **`tools/releaseVersion.ts`** — the bump algorithm and the one version
  computation ([the pipeline](#release-pipeline)); emits `version`/`tag`/
  `create-release` as job outputs. Replaced the deleted
  `tools/siteVersion.ts`.
- **`tools/createRelease.ts`** — builds the library at that version,
  generates the release assets, and creates the tag + GitHub release. Also
  exports `buildThirdPartyMarkdown`, reused by `tools/verifyNpmTypes.ts`.
- **`tools/publishNpm.ts`** — the npm job: registry check, stage, publish.
- **`tools/githubOutput.ts`** — `$GITHUB_OUTPUT` writing (heredoc-escaped,
  a no-op off CI so the same scripts run on a laptop).
- **`tools/npmPublishPlan.ts`** — `planNpmPublish`, the pure publish/skip
  decision (including the [cutoff](#npm-publish-cutoff)), and the read-only
  `checkNpmRegistryHasVersion`. Renamed from `tools/npmRecovery.ts`:
  reconciling is now the ordinary path, not a recovery mode.

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
- **`tools/dtsArtifactChecks.ts`** — the companion gate wired into the same
  plugin's `afterBuild` hook: inspects the actual bytes written to
  `dist-lib/odl-drawcustom-designer.d.ts` and fails the build if it's empty,
  missing the `mount()` declaration, leaks an ambient `declare
  module`/`declare global` (issue #122's bidi-js leak, see
  [`src/core/renderer/bidi-module.ts`](../src/core/renderer/bidi-module.ts)),
  or imports a type from a package this npm package declares no dependency
  on — all things a clean TypeScript compile alone would not catch.
- **`tools/verifyNpmTypes.ts`** (`npm run verify:types`) — the scratch-consumer
  acceptance check: builds the library, stages and `npm pack`s the npm
  package for real, installs the tarball into a throwaway project, and
  `tsc --noEmit`s a fixture that correctly uses `mount()`/`MountHandle`
  (must pass) alongside one with a bad option name and a wrong argument type
  (must fail) — `tools/npmTypesConsumerFixture.ts` builds both fixture
  sources. Runs in CI's `checks` job (`.github/workflows/pages.yml`) on every
  PR, and rebuilds `dist-lib/` itself as a side effect (`APP_VERSION=0.0.1`),
  so avoid running it concurrently with something else that reads that
  directory (e.g. a local Playwright e2e run against `dist-lib/`).
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

The npm job stages from the `dist-lib/` artifact the `version` job uploaded
— the same bytes attached to the GitHub release — and runs `npm publish
--access public --provenance` against that staged directory. It runs in
parallel with the Pages deploy and after the release already exists, which
is why the registry check in front of it is not optional: see
[Failure and recovery](#failure-and-recovery).

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

**What the workflow needs** (all present in `auto-release.yml`'s `npm` job):

- `permissions: id-token: write` on the `npm` job — mints the OIDC token npm
  exchanges for a publish credential. That job needs no more than
  `contents: read` besides; `contents: write` lives on the `version` and
  `pages` jobs, which create the release and push to `gh-pages`.
- The workflow **filename** must stay `auto-release.yml` — the trusted
  publisher on npmjs.com is configured against it
  ([One-shot setup](#one-shot-setup-completed), step 2).
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
  `disabled`, a typo — and `tools/publishNpm.ts` logs
  `NPM_PUBLISH repo variable not enabled — npm publish skipped (docs/releasing.md#npm)`
  and writes the same warning to the job summary — **prominent, but not a
  failure** — while the GitHub release and the Pages deploy complete
  normally.
- Once `NPM_PUBLISH` is `enabled`, that safety net is gone: a real publish
  failure (trusted publisher not configured, a name/version collision, a
  registry outage) fails the `npm` job loudly, same as every other step.
  Because that failure happens after the GitHub release already exists,
  re-running that one job publishes the version — see
  [Failure and recovery](#failure-and-recovery) below.

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

## Failure and recovery

The pipeline's three jobs fail independently, and **re-running is the
recovery path** in every case (AGENTS.md, "idempotency is part of the
contract"). GitHub's **"Re-run failed jobs"** re-runs only the failed jobs
and preserves the successful ones' outputs and artifacts, so a failed
publish is re-driven against the *same* version without recomputing
anything.

| What failed | State afterwards | Recovery | What a re-run does |
|---|---|---|---|
| `version` — gate red (`npm test` / `npm run lint`) | Nothing tagged, nothing published, site unchanged | Fix the code and push (or `workflow_dispatch` once fixed) | Recomputes the version from tag ancestry — the version is derived, never stored, so nothing is stale |
| `version` — `build:lib` or asset generation | Nothing tagged (those steps run **before** `gh release create`) | Re-run the job | Same as above |
| `version` — `gh release create` | Nothing tagged (the command is atomic: tag + release together) | Re-run the job | Recomputes the same version and retries the creation |
| `version` — artifact upload, **after** the release was created | Tag + release exist; nothing published | Re-run the job | The new tag is now reachable from HEAD → `already-released`, so it rebuilds the same artifacts and creates **no** second release |
| `npm` | Tag + release exist; **site still deploys** (parallel job, unaffected) | Re-run failed jobs | `tools/publishNpm.ts` asks the registry for that version, gets a 404, and publishes it |
| `pages` | Tag + release exist; **npm still publishes** (parallel job, unaffected) | Re-run failed jobs | Rebuilds the site at the same `APP_VERSION` and redeploys — deploying identical content again is harmless |
| both publishes | Tag + release exist | Re-run failed jobs | Both re-run, again in parallel, each idempotent |

**Idempotency, concretely:**

- **npm** — `tools/publishNpm.ts` always asks
  `GET registry.npmjs.org/@schlomo%2Fodl-drawcustom-designer/<version>` first.
  Already published → clean skip. 404 → publish. Any *other* status or a
  network error → **fail loudly**; a registry outage must never be misread
  as "not published". The decision (`planNpmPublish` in
  [`tools/npmPublishPlan.ts`](../tools/npmPublishPlan.ts)) is a pure
  function, unit-tested in
  [`tests/tools/npmPublishPlan.test.ts`](../tests/tools/npmPublishPlan.test.ts);
  the registry lookup (`checkNpmRegistryHasVersion`) is separate so the
  decision needs no network mocking. There is no separate "recovery mode"
  any more — the ordinary path *is* the recovery path.
- **GitHub release** — the `version` job creates one only when the version
  has no tag reachable from HEAD. A re-run after a successful creation sees
  `already-released` and creates nothing.
- **Pages** — a deploy of the same `dist/` is a no-op commit on `gh-pages`.

**The one gap, stated plainly.** The npm job reconciles *this run's*
version. If `npm publish` fails for `v3.4.0` and someone then merges
something else, the next run releases `v3.4.1` and publishes that — `v3.4.0`
stays missing from the registry. Recover a stranded publish **before merging
anything else**, with "Re-run failed jobs" on that run or a
[`workflow_dispatch`](#manual-retry-workflow_dispatch) (which lands on
`already-released` for that tag and publishes it), or by hand with the
[manual fallback](#manual-npm-publish-fallback) below. This gap is unchanged
from the previous design, which recovered only on its "no commits since the
tag" path.

**`NPM_PUBLISH` not enabled** is not a failure: `tools/publishNpm.ts` logs
`NPM_PUBLISH repo variable not enabled — npm publish skipped`, writes the
same warning to the job summary — prominent, but green — and the release and
Pages deploy stand on their own. Once the variable is `enabled`, a real
publish failure fails the job loudly, same as every other step.

### npm-publish cutoff

`v1.0.0`–`v1.0.4` were released before this npm-publish feature (issue #103)
existed at all — their GitHub releases carry no npm-related assets and were
never meant to reach npm, so the npm job must never retroactively publish
them. The cutoff is `NPM_PUBLISH_CUTOFF_VERSION = '1.1.0'` in
[`tools/npmPublishPlan.ts`](../tools/npmPublishPlan.ts): the latest tag at
the time npm publishing was added is `v1.0.4`, and that feature's own commit
was `feat:`-scoped (minor bump), so the first version that can ever carry an
npm publish is `v1.1.0`. It's a literal constant, not derived from a tag
lookup, so the cutoff can never silently drift if a later release renumbers
something.

### Manual npm-publish fallback

For completeness — not the tested/normal path. If re-running the npm job
isn't possible and you need to publish a specific version to npm right away,
stage and publish it by hand from a checkout of that tag, reusing the same
tested `tools/` functions the pipeline itself uses:

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
const distLibDtsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.d.ts');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
const resolvedPaths = resolveTransitiveRuntimeDependencyPaths(packageLock, bundledDependencyNames(pkg));
const thirdPartyMarkdown = generateThirdPartyMarkdown(collectBundledDependencyInfo(resolvedPaths, repoRoot));
stageNpmPackage({
  version: 'X.Y.Z',
  repoRoot,
  distLibJsPath,
  distLibDtsPath,
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
tarball contains exactly the ESM, its bundled `.d.ts`, `package.json`,
`README.md`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md`.) In practice, re-running
the failed `npm` job — or a `workflow_dispatch` — is simpler and is the
tested path; this manual fallback exists only for an urgent one-off.

## Manual retry (`workflow_dispatch`)

The workflow also accepts a manual trigger (Actions tab → "Release" → "Run
workflow", or `gh workflow run auto-release.yml`) — this runs the **exact
same three jobs** against the current `main`, not a different path. With
nothing new to release the `version` job reports `already-released` for the
current tag, creates nothing, and both publish jobs run and reconcile
against that version. Use it to force an immediate reconciliation after a
transient failure (npm registry hiccup, GitHub API outage, a Pages deploy
that needs redoing) without waiting for the next push to `main`. Note that
"Re-run failed jobs" on the original run is usually better: it re-runs only
what failed, against the version already computed there. See
[Failure and recovery](#failure-and-recovery).

**Dependabot path:** a Dependabot PR that passes `checks` and gets merged
releases a patch (its title is a `build(deps):` commit → patch bump) with
zero further action. Enabling Dependabot
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

**Status (verified):** the previous single-job workflow ran for real and
produced `v1.2.0` (2026-08-16) with Trusted Publishing provenance, and every
release since. The decision logic is covered by unit tests
(`tests/tools/releaseVersion.test.ts`, `tests/tools/createRelease.test.ts`,
`tests/tools/npmPublishPlan.test.ts`, `tests/tools/publishNpm.test.ts`,
`tests/tools/githubOutput.test.ts`). The **fan-out shape itself** (three jobs,
job outputs, artifact hand-off) is new as of 2026-09-01 and cannot be
exercised outside GitHub Actions — it is verified for the first time by the
first real push to `main` after it merges.

## One-shot setup (completed)

Everything in this section happened **once**, to bring npm publishing online
for `@schlomo/odl-drawcustom-designer`. It's kept here as a reference — and
as the recipe for redoing this against a **new** package (a rename, a fork,
a different scope) — not as a repeated maintainer action. Day-to-day, none
of this runs again: ordinary releases are fully described by
[Release pipeline](#release-pipeline)
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
   # …stage dist-npm/ as in the manual-fallback script above (Failure and recovery)…
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
