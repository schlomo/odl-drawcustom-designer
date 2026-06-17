# GitHub Copilot — repository-wide instructions

This is the **repo-wide** custom-instructions file ([GitHub Docs](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)). It applies to all paths. Path-specific rules belong in `.github/instructions/NAME.instructions.md` with an `applyTo:` frontmatter — we do not use those unless scoped rules are needed.

Copilot also reads root **[`AGENTS.md`](../AGENTS.md)** natively. Follow it first — same policy as Cursor and Claude Code.

## Quick rules

1. **Read ADRs** before changing renderer, YAML, templates, or export — start with `docs/adr/ADR-007-hybrid-rendering.md` and `docs/adr/ADR-011-behavior-test-policy.md`.
2. **TDD** — write Vitest tests that assert **user-visible or HA-visible behavior** before implementation (`docs/testing.md`).
3. **Core boundary** — no `react` imports in `src/core/`.
4. **HA parity** — do not commit visual/export fixes verified only by HTML/SVG attributes; use geometry or pixel/outcome tests on the render/export path.
5. Run `npm test` and `npm run lint` after changes.
6. Run `npm run build` before committing.

Spec: `docs/spec/supported_types.md` · Parity: `docs/spec/odl-gap-report.md`
