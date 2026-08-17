# Agent instructions

This file is the **canonical** guide for AI assistants in this repository — **Cursor**, **Claude Code**, **GitHub Copilot**, and any other coding agent. Tool-specific entry points (`CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/`) point here or mirror these rules.

**GitHub Copilot** also reads root [`AGENTS.md`](AGENTS.md) natively (nearest file in the tree wins for subdirectories). Do not duplicate policy in `.github/instructions/*.instructions.md` unless you need **path-scoped** rules — see [Tool-specific files](#tool-specific-files-parity).

## Before you change code

1. **Read relevant ADRs** in [`docs/adr/`](docs/adr/). Skipping this causes rework (e.g. renderer parity, export shape).
2. **Read [`docs/testing.md`](docs/testing.md)** — TDD workflow and behavior-test policy (ADR-008, ADR-011).
3. For draw payloads / element fields: [`docs/spec/supported_types.md`](docs/spec/supported_types.md) and [`docs/spec/odl-gap-report.md`](docs/spec/odl-gap-report.md).
4. For rendering or PNG export: **[ADR-007](docs/adr/ADR-007-hybrid-rendering.md)** (HA `imagegen` parity goal, SVG vs canvas trade-offs).

### ADR index (read when touching…)

Full set lives in [`docs/adr/`](docs/adr/). Read the rows that match your task before coding.

| ADR | Topic | Touch when… |
|-----|--------|-------------|
| [001](docs/adr/ADR-001-core-ui-separation.md) | Core / UI boundary | Any `src/core/` work; **no React in core** |
| [002](docs/adr/ADR-002-local-content-map.md) | Local content map | Assets, fonts, images, `/local/` paths, Content Manager, host asset resolver (last tier) |
| [003](docs/adr/ADR-003-indexeddb-schema.md) | IndexedDB (Dexie) | Mocks, variables, session, migrations (`src/storage/`) |
| [004](docs/adr/ADR-004-template-evaluator-scope.md) | Template evaluator | Jinja preview, `namespace()`, Simulator variables, `state_attr` |
| [005](docs/adr/ADR-005-share-hash-format.md) | Share hash `#d=` | Share links, hash import/bootstrap |
| [006](docs/adr/ADR-006-ui-framework-react.md) | React shell | App structure, major UI architecture |
| [007](docs/adr/ADR-007-hybrid-rendering.md) | Hybrid rendering | Renderer, canvas, **PNG export**, HA visual parity |
| [008](docs/adr/ADR-008-tdd-and-ci.md) | TDD + CI | **Always** before finish; CI gates |
| [009](docs/adr/ADR-009-yaml-jinja-editor.md) | YAML / Jinja editor | CodeMirror, inline template preview, completions |
| [010](docs/adr/ADR-010-ha-embed-mode.md) | HA embed (future) | Live HA connection, iframe / panel embed |
| [011](docs/adr/ADR-011-behavior-test-policy.md) | Behavior tests | **Always** when writing tests |
| [012](docs/adr/ADR-012-odl-drawcustom-strategy.md) | ODL / drawcustom | Export shape, HA vs ODL alignment, gap report |
| [013](docs/adr/ADR-013-universal-property-templating.md) | Universal templating | Property panel, templated element fields |
| [014](docs/adr/ADR-014-product-naming.md) | Product naming | `src/core/brand.ts`, slug, storage keys |
| [015](docs/adr/ADR-015-showcase-demo-bundle.md) | Showcase demo bundle | Load Demo, `src/assets/showcase/`, first-run mocks |
| [016](docs/adr/ADR-016-toolbar-chrome-layout.md) | Toolbar chrome | Responsive toolbar rows, label collapse |
| [017](docs/adr/ADR-017-host-adapter-seam.md) | Host-adapter seam | `src/embed/` mount lifecycle, host policy (theme/persistence/chrome), new host runtimes |
| [018](docs/adr/ADR-018-host-ui-seam.md) | Host UI seam | Targets/display picker, state catalog, host actions, preview provider — anything in `src/embed/` carrying host-driven UI |

## Architecture

- **`src/core/`** — pure TypeScript; **never** import React. Business logic lives here.
- **`src/ui/`** — React shell; calls core via `src/core/index.ts`.
- **`src/storage/`** — IndexedDB adapters (assets, mocks, variables, session).
- **`src/embed/`** — the **one** designer mount lifecycle plus its host adapters (issue #72, ADR-017): `mountDesigner()` in `mount.tsx` (DOM/render target, React root, bootstrap, push queue), `host.ts` (`DesignerHost` policy interface — internal, not published), `standaloneHost.ts` (GitHub Pages SPA), `embeddedHost.ts` (what the public `mount()` builds), `types.ts` (host data contract, ADR-010). Library build via `npm run build:lib`, docs in [`docs/embedding.md`](docs/embedding.md).
- **`src/assets/showcase/`** — built-in **Load Demo** bundle: `showcase.yml` (payload), `showcase.json` (canvas + simulator seed), `showcase.png` (bundled image). Loaded by `src/ui/data/showcase.ts` (ADR-015).
- **`src/ui/lib/clear-demo-data.ts`** — **Clear all** strips only unmodified showcase simulator entries; user mocks survive.

### Key paths (orientation)

| Task | Start here |
|------|------------|
| Edit demo layout / templates | `src/assets/showcase/showcase.yml` |
| Edit demo simulator seed | `src/assets/showcase/showcase.json` |
| Template evaluation | `src/core/templates/evaluate.ts`, ADR-004 |
| State Simulator UI | `src/ui/components/StateSimulator.tsx`, `useProjectState.ts` |
| Element / YAML schema | `src/core/schema/`, `docs/spec/supported_types.md` |
| Renderer / export | `src/core/renderer/`, ADR-007 |

ESLint enforces the core boundary.

### Editor sync invariants (ADR-009)

Full contract: [ADR-009](docs/adr/ADR-009-yaml-jinja-editor.md).

- User-initiated CodeMirror changes must carry a `userEvent` annotation (e.g. `input.complete`, `input.type`); `shouldReportYamlDocChange` (`src/ui/editor/yamlEditorSelection.ts`) ignores unannotated transactions **by design**.
- External programmatic syncs (elements → editor text) must stay **unannotated** — annotating them makes the sync loop mistake its own echo for a user edit.
- **Echo contract:** an external sync must never rewrite newer editor text; blocked/pending state is read via **refs**, never effect dependencies (a state flip must not re-trigger the sync effect). Violations of either rule shipped real bugs (canvas lockup after autocomplete; typed text corrupted).
- **Drag suspension (issue #124):** a canvas drag suspends the elements → editor sync for the whole gesture and syncs once at pointerup, through that same effect — no new sync entry point, no new bypass of the echo contract. Serialization lives **inside** the effect, so a suspended run serializes nothing; the suspension **consumes** `skipExternalSyncRef` (a canvas pointerdown blurs the editor, so a draft's flush arms that flag in the very batch the drag starts, and it would otherwise swallow the drag-end sync).
- **Scroll containment:** all editor scroll-into-view goes through the `EditorView.scrollHandler` facet in [`src/ui/editor/yamlScrollContainment.ts`](src/ui/editor/yamlScrollContainment.ts), which contains scrolling to the editor's own scroller — it must never reach `window`/the embedding host page (guarded by `tests/e2e/embed-host-scroll.spec.ts` and `standalone-drag-scroll.spec.ts`). Never add scroll calls that bypass it; CM silently swallows scroll-handler exceptions, so geometry work must stay inside its keyed `requestMeasure` pass.

## Embed mode invariants

Full contract: [`docs/embedding.md`](docs/embedding.md) (ADR-010, ADR-017, ADR-018).

- **One channel per concern** (2.0, issue #121 — do not reintroduce a second one):
  - **Displays: `targets` only.** A one-element push is adopted and locked without a pick; a longer list is a choice and moves nothing by itself. There is no `capabilities`/`lock` mount option, no `setCapabilities()`, no anonymous "Host display" picker entry, and no last-write-wins precedence between channels. Auto-adoption stops for good once the user picks a display, picks Virtual, or works the lock.
  - **Save/send: host `actions` only.** No `onSaveRequest`, no `DesignerHost.onSaveRequest`, no built-in Save button — a host that wants one registers `{ id: 'save', label: 'Save' }`. Keep `HostActionButtons` free of action-specific behavior.
  - **One display mapping:** `capabilitiesToCanvas` resolves from the designer's canonical defaults (only `previewDitherMode` carries over from the current canvas). Never re-add a merge-onto-current base — it leaks one panel's rotation or measured palette onto another (ADR-007 parity).
- **Published embed declarations stay domain-neutral** (ADR-018): "state", "display", "target", "action" — never "entity", "hass" or "service" in `src/embed/` public types, options, handle methods or their docs. State *keys* stay opaque host ids.
- The shared mount lifecycle (`src/embed/mount.tsx`) must never touch `document.documentElement`, `document.head` styles, or global theme — everything scoped to the mount wrapper/shadow root (PR #67/#74). Document-level theming is the **standalone adapter's** policy (`src/embed/standalone.tsx`, `theme: { owner: 'designer' }`); never move it into the lifecycle or the shell.
- **No runtime mode in the React shell** (ADR-017): `App`/`useProjectState` read `DesignerHost` policy (theme owner, `fill`, `shareLink`, `persistence`, `actions`/`onAction`, `targets`/`onTargetSelected`) and take a **required** host. Do not reintroduce an `embedded` flag or an optional host defaulting to standalone — an implicit default is how an embedded mount would end up theming the host document.
- Standalone output must stay byte-identical when no host data is pushed — palette/renderer helpers return canonical constants absent overrides (PR #75). Same rule for the **host asset resolver** (issue #138): with none installed, the asset loaders take exactly their pre-tier code path (`hasHostAssetResolver()` is checked before anything is awaited).
- **Host assets are the LAST resolution tier** (issue #138, ADR-002): local content map → bundled → `resolveAsset`, keyed by `(kind, name)` end to end — a font answer must never vouch for an image of the same name. Never let the host tier pre-empt an uploaded or bundled asset, never teach the designer a search path (the host owns those), and never let an unsupplied asset degrade into a substituted font or a silent gap — it must reach the existing explicit render-error state naming the asset (issue #10). A resolver that never settles is that same failure (`HOST_ASSET_TIMEOUT_MS`, no `AbortSignal` in layer 1); a decline is retried only on the next asset-affecting load pass after `HOST_ASSET_RETRY_DELAY_MS`, never by a timer — say so in docs rather than implying a TTL that heals itself.
- **Whatever a mount installs, a failed mount uninstalls** (issue #116, extended by #138): `mountDesigner` builds one `teardown` list, unwound by both `destroy()` and any synchronous failure before the first committed frame (`duringMount`). Register new mount-time ownership there — a second cleanup sequence is how the next addition escapes the container's pristine guarantee. Module caches populated **from a host** (parsed opentype fonts, the core font registry, `document.fonts` faces) are evicted via `registerHostAssetEvictor` when that mount goes away; leaving them is a cross-host render window.
- **Host pushes must land in the first observable frame** (issue #115, ADR-017): `useProjectState` registers its push target with `useLayoutEffect` — it is the shell's imperative handle to the host, and passive registration left a macrotask-wide window where an already-made push was neither applied nor visible. Never demote it to `useEffect`; and never "fix" a push assertion by wrapping it in `waitFor` — poll-instead-of-assert is what hid this bug across two PRs.
- Library build = single self-contained ESM, React bundled, no code splitting (deliberate — composition, wire sizes, and rejected alternatives documented in [`docs/bundle-audit.md`](docs/bundle-audit.md), issue #22); `dist-lib` must work from any dumb static file server.
- Clipboard/capability features must capability-detect (`window.isSecureContext`, presence checks) and surface visible explanations — insecure-LAN Home Assistant boxes are the PRIMARY deployment, not an edge case (PRs #77/#81).
- Hidden overlays/tooltips must use `display:none`, not `visibility:hidden`/`invisible` — hidden layout boxes widen scrollers (horizontal-scrollbar bug class, PR #85; see issue #86 for remaining instances).
- Floating UI (tooltips, dropdowns, popovers) must render within the mount boundary — never assume space exists outside the frame, since an embedded host (HA panel iframe/shadow container) may give the mount zero space on any side. Top-row chrome (`ToolbarTooltip`/`IconButton`'s `placement`/`tooltipPlacement="below"`) must always open downward; controls deeper in the layout may keep an upward placement only where their own container has visible headroom (maintainer ruling 2026-08-16, screenshot evidence: a disabled host-action tooltip opening above the top toolbar row, `HostActionButtons.tsx`).

## Build-time defines

Any env-derived value baked via `define` in `vite.config.ts` must short-circuit under Vitest — follow the `vitest:` source-flag pattern in `tools/gitRevision.ts` (keyed off `process.env.VITEST` in `vite.config.ts`). GitHub Actions sets `GITHUB_REF_NAME='<n>/merge'` etc. on `pull_request` runs; an unguarded define once leaked that into the Vitest runtime and broke CI for every open PR at once.

Repo uses Tailwind **v4** — utility names differ from v3 (`bg-linear-to-*`, not `bg-gradient-to-*`); do not "correct" v4 names to v3, and brief code reviewers accordingly (a review false-positive already happened).

## TDD (non-negotiable)

Follow **Red → Green → Refactor** (ADR-008).

| Layer | Tests | Run |
|-------|--------|-----|
| Core | `tests/core/` | `npm test` |
| UI | `tests/ui/` | `npm test` |
| Storage | `tests/storage/` | `npm test` |
| E2E (real browser wiring) | `tests/e2e/` | `npm run test:e2e` |

**Do not merge or commit** core/renderer changes without tests that fail before the fix and pass after.

**E2E (Playwright, ADR-011 revised 2026-07-15):** a small smoke suite for real
CodeMirror ↔ React ↔ canvas wiring that Vitest/jsdom cannot exercise (real
pointer events, debounce timing, real `EditorView` layout) — not a place for
logic Vitest already covers. Runs via its own `npm run test:e2e`, separate
from the `npm test` merge gate.

### Behavior tests only (ADR-011)

Assert **observable outcomes** — what the user or HA integration sees — not internal hooks.

| Good | Bad |
|------|-----|
| `bounds.y + bounds.height` ≈ `anchorY` for `lb` text | `expect(html).toContain('crispEdges')` |
| Exported divider row pixels are `#000000`, not `#808080` | `expect(fn()).toBe(true)` on a one-line helper |
| YAML round-trip equality on golden fixtures | Duplicate “renders without error” per type |

**Renderer / visual parity:** If the task is “match Home Assistant preview or PNG”, the test must exercise the **render or export path** (e.g. `renderText` + primitive geometry, or PNG finalize + pixel sample). Markup attribute checks alone are **not** sufficient.

## Home Assistant preview parity (ADR-007)

**Goal:** Preview and PNG export should **closely match** OEPL/OpenDisplay HA `imagegen` (Pillow, integer pixels, tag palette).

**Known gaps** (manage expectations; fix with behavioral tests):

- **SVG shapes/lines** — browser antialiasing + export rasterize can turn `fill: black` into grey (`#808080`) on coloured backgrounds; attribute-only “fixes” have failed without pixel verification.
- **Text** — ink-bound anchors and hard-edge opentype draw are implemented and tested; glyph shapes still differ slightly from Pillow.
- **Templates** — mock states only; live HA may differ.

Prefer fixes that move tag paint toward a **single raster compositor** when parity is required (see ADR-007 future direction).

## Before finishing / committing

```bash
npm test && npm run lint && npm run build
```

Use `npm ci` in CI. Deploy is blocked on failure (ADR-008).

## CI notes

**Runs on laptop or CI** — every script CI calls must run identically on a developer laptop (loud env checks, no runner-only assumptions). Thin CI (no logic in workflow YAML, behavior in tested `tools/` scripts) exists precisely so CI tooling can be developed and debugged locally.

`.github/workflows/pages.yml`:

- The **`checks`** job is the merge gate: lint, `test:ci` (vitest), build, Playwright, JUnit check-run publishing.
- The **`preview`** job is deliberately build+deploy only — do **not** re-add lint/test there (a red-tests PR still gets a preview; `checks` is what blocks merge).
- All gh-pages pushes (production + every PR preview) share one serializing concurrency group. If Pages reports "Page build failed" right after rapid consecutive merges, it's almost always the superseded-legacy-build race — **rerun the failed job**, don't debug content.
- Fork PRs run with a read-only token: check-run publishing (`dorny/test-reporter`) is skipped there; inline annotations and artifacts still work.

## Commits

Only commit when the user asks, unless their task explicitly includes committing. Do not commit parity “fixes” that lack behavioral test coverage.

Releases use GitHub's auto-generated notes ([`docs/releasing.md`](docs/releasing.md)), so commit/PR titles **are** the changelog verbatim. Write conventional, imperative, user-meaningful summary lines for a release reader, not just a code reader.

Commit titles also **drive the semver bump** (auto-release derives it from conventional types). A change that additively grows the embed public surface (`src/embed/` exports, `MountOptions`/`MountHandle`, host data contract) is a `feat:` even when the work feels like refactoring — v1.0.1 shipped as a patch despite `mountStandaloneApp()` gaining a `MountHandle` return because the commit said `refactor:`. Review briefs for embed-surface diffs include a title-vs-semver check.

## Process rules

- Roadmap and planning live in **GitHub milestones + issues only** — never create `ROADMAP.md` or a backlog document.
- Only the maintainer merges PRs. AI agents/assistants never merge and never enable auto-merge.
- **TDD red-first means proving the new test can fail:** run it against pre-fix code (or a deliberate revert) and record the failure before claiming red→green.
- Review-bot comments (e.g. Copilot) may target a stale revision — verify each claim against the current pushed commit before acting; reply-and-resolve with evidence when a finding is already fixed or refuted.
- **Every PR body carries two sections** (maintainer ruling 2026-08-16): **Verified** — what was tested and how (gate results, red-first evidence, review passes, e2e), and **Maintainer validation** — what only the human should check before merging (manual test steps, policy calls baked in, explicitly UNVERIFIED items). Update both when the PR changes.

## Parallel agents / git worktrees

When several agents work on this repo at once (e.g. one PR per issue), **isolate each task in its own git worktree**. Do **not** let a subagent switch branches or stage changes in the primary checkout — that strands the user's working tree and makes other agents see a dirty/branch-switched directory (this caused real collisions: one agent had to stash and recover).

Rules:

- The **primary checkout stays on the user's branch** (usually `main`). No subagent branch-switches or edits files there.
- Each task gets a dedicated worktree + branch off `main`:

```bash
git worktree add ../odl-drawcustom-designer-<task> -b <branch> origin/main
cd ../odl-drawcustom-designer-<task>
npm ci   # node_modules is per-worktree (not tracked); each needs its own install
# …TDD, commit, push, open PR from here…
```

- One branch can only be checked out in one worktree (git enforces this — rely on it).
- After the PR merges, clean up: `git worktree remove ../odl-drawcustom-designer-<task>` and `git branch -d <branch>`.
- If two PRs touch the same core file (e.g. `src/core/templates/evaluate.ts`), state a **merge order** and rebase the second branch onto the first after it lands.
- **Rebase only from the origin ref, never a possibly-stale local checkout** (2026-08-16 incident): rebasing a local branch that is behind its own remote silently drops the missing commits, and `--force-push-with-lease` does NOT protect you — after a fetch, the lease matches the tracking ref and the push overwrites the newer remote work (this lost the npm README from PR #113; recovered in PR #123). Before any rebase: `git fetch && git reset --hard origin/<branch>` (or do the rebase in a fresh worktree created from the origin ref).
- Playwright picks a free preview port automatically per run — concurrent worktrees can't collide; set `PW_PORT` for a fixed port.
- Cost-effective orchestration: run a read-only investigation before dispatching fixes; keep one PR per concern with file-disjoint territories and a declared merge order when territories touch; for small follow-ups (comment fixes, doc tweaks) prefer a fresh agent with a self-contained brief over resuming a long-lived agent transcript.
- Tier the verification, not just the work (2026-07-20 M3 retro): the supervising thread reviews **tiny diffs inline** (a 2-line fix needs no review agent); dispatch a review agent only for multi-file diffs or landmine territory (editor sync, renderer/palette, mount lifecycle). Per-PR pattern that worked: implement agent → in parallel, rerun the full gate on the **pushed** SHA + review agent → adjudicate reviewer findings against compiled output before requesting changes (a reviewer flagged Tailwind v4's `bg-linear-to-*` as a bug from v3 knowledge — one grep of the built CSS settled it).
- Review/mechanical briefs state the repo's framework versions (Tailwind v4, React 19, CodeMirror 6) when the diff touches their surface — prevents version-knowledge false positives. Bounded mechanical tasks (nit fixes, doc-only changes) go to a cheaper model / lower effort; reserve default-model agents for feature and fix work.

## Tool-specific files (parity)

| Tool | What it reads | Role |
|------|----------------|------|
| **All** | [`AGENTS.md`](AGENTS.md) | Canonical policy — edit this first |
| Claude Code | [`CLAUDE.md`](CLAUDE.md) | Pure `@AGENTS.md` import (Claude Code inlines it) |
| GitHub Copilot | [`AGENTS.md`](AGENTS.md) + [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Root agent file (native) + repo-wide custom instructions |
| **Cursor only** | [`.cursor/rules/*.mdc`](.cursor/rules/) | Auto-injected rules (`alwaysApply` or file globs) |
| **Cursor only** | [`.cursor/agents/*.md`](.cursor/agents/) | Subagent prompts (core-implementer, spec-reviewer, ui-wirer) |

Claude Code and Copilot **do not** load `.cursor/`. Cursor rules should **mirror** `AGENTS.md`, not contradict it.

### GitHub Copilot: two instruction file types

Per [GitHub Docs](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot):

| File | Scope | Use for this repo |
|------|--------|-------------------|
| **`.github/copilot-instructions.md`** | Repository-wide (all paths) | **Yes** — short pointer + quick rules (already in repo) |
| **`.github/instructions/NAME.instructions.md`** | Path-specific (`applyTo:` glob in YAML frontmatter) | **Optional** — only if we need rules that apply when editing `src/core/**` etc., mirroring `.cursor/rules/core-boundary.mdc` |
| **`AGENTS.md`** (root) | Agent instructions (Copilot cloud agent / coding agent) | **Yes** — canonical policy |

The GitHub **“Add Copilot instructions”** button in the web UI defaults to creating a **path-specific** `*.instructions.md` under `.github/instructions/`. That is **not** a replacement for `.github/copilot-instructions.md`. For repo-wide TDD/ADR/HA parity rules, keep **`copilot-instructions.md`** (and `AGENTS.md`). Both are merged when Copilot works on matching files.

When updating agent policy: **change `AGENTS.md` first**, then sync `.github/copilot-instructions.md` and `.cursor/rules/tdd-required.mdc` (and subagent files if their scope changed). `CLAUDE.md` is a pure `@AGENTS.md` import and never needs syncing.

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
