# Agent instructions

This file is the **canonical** guide for AI assistants in this repository — **Cursor**, **Claude Code**, **GitHub Copilot**, and any other coding agent. Tool-specific entry points (`CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/`) point here or mirror these rules.

**GitHub Copilot** also reads root [`AGENTS.md`](AGENTS.md) natively (nearest file in the tree wins for subdirectories). Do not duplicate policy in `.github/instructions/*.instructions.md` unless you need **path-scoped** rules — see [Tool-specific files](#tool-specific-files-parity).

## Before you change code

1. **Read relevant ADRs** in [`docs/adr/`](docs/adr/). Skipping this causes rework (e.g. renderer parity, export shape).
2. **Read [`docs/testing.md`](docs/testing.md)** — TDD workflow and behavior-test policy (ADR-008, ADR-011).
3. For draw payloads / element fields: [`docs/spec/supported_types.md`](docs/spec/supported_types.md) and [`docs/spec/odl-gap-report.md`](docs/spec/odl-gap-report.md).
4. For rendering or PNG export: **[ADR-007](docs/adr/ADR-007-hybrid-rendering.md)** (HA `imagegen` parity goal, SVG vs canvas trade-offs).

### ADR index (read when touching…)

| ADR | Topic |
|-----|--------|
| [001](docs/adr/ADR-001-core-ui-separation.md) | `src/core/` vs `src/ui/` — no React in core |
| [004](docs/adr/ADR-004-template-evaluator-scope.md) | Jinja / template preview |
| [007](docs/adr/ADR-007-hybrid-rendering.md) | Hybrid SVG + canvas; **match HA Pillow output** |
| [008](docs/adr/ADR-008-tdd-and-ci.md) | TDD + CI gates |
| [011](docs/adr/ADR-011-behavior-test-policy.md) | **Behavior** tests, not implementation mirrors |
| [012](docs/adr/ADR-012-odl-drawcustom-strategy.md) | ODL vs HA `drawcustom` export |

## TDD (non-negotiable)

Follow **Red → Green → Refactor** (ADR-008).

| Layer | Tests | Run |
|-------|--------|-----|
| Core | `tests/core/` | `npm test` |
| UI | `tests/ui/` | `npm test` |
| Storage | `tests/storage/` | `npm test` |

**Do not merge or commit** core/renderer changes without tests that fail before the fix and pass after.

### Behavior tests only (ADR-011)

Assert **observable outcomes** — what the user or HA integration sees — not internal hooks.

| Good | Bad |
|------|-----|
| `bounds.y + bounds.height` ≈ `anchorY` for `lb` text | `expect(html).toContain('crispEdges')` |
| Exported divider row pixels are `#000000`, not `#808080` | `expect(fn()).toBe(true)` on a one-line helper |
| YAML round-trip equality on golden fixtures | Duplicate “renders without error” per type |

**Renderer / visual parity:** If the task is “match Home Assistant preview or PNG”, the test must exercise the **render or export path** (e.g. `renderText` + primitive geometry, or PNG finalize + pixel sample). Markup attribute checks alone are **not** sufficient.

## Architecture

- **`src/core/`** — pure TypeScript; **never** import React. Business logic lives here.
- **`src/ui/`** — React shell; calls core via `src/core/index.ts`.
- **`src/storage/`** — IndexedDB adapters.

ESLint enforces the core boundary.

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

## Commits

Only commit when the user asks, unless their task explicitly includes committing. Do not commit parity “fixes” that lack behavioral test coverage.

## Tool-specific files (parity)

| Tool | What it reads | Role |
|------|----------------|------|
| **All** | [`AGENTS.md`](AGENTS.md) | Canonical policy — edit this first |
| Claude Code | [`CLAUDE.md`](CLAUDE.md) | Short pointer + numbered summary |
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

When updating agent policy: **change `AGENTS.md` first**, then sync `CLAUDE.md`, `.github/copilot-instructions.md`, and `.cursor/rules/tdd-required.mdc` (and subagent files if their scope changed).
