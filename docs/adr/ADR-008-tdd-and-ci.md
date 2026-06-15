# ADR-008: TDD policy and CI gates

## Status

Accepted

## Context

Correctness of YAML round-trip, template evaluation, and rendering is the product's core value. Regressions must not reach GitHub Pages deploy.

## Decision

**TDD workflow:** Red → Green → Refactor

| Layer | Tool | Scope |
|-------|------|-------|
| Core (yaml, schema, templates, assets, renderer) | Vitest | Golden fixtures from `docs/spec/supported_types.md` (HA drawcustom); ODL parity via `docs/spec/odl-gap-report.md` |
| UI smoke | Playwright (optional) | Load app, add element, edit property, copy YAML |

**Rules:**

- No feature merges without tests in the **core** layer first
- UI tests follow for wiring, not business logic — see **ADR-011** for behavior vs implementation policy
- ESLint core boundary must pass
- CI: `npm ci` → `npm run lint` → `npm test` → `npm run build` → deploy to GH Pages

Fixtures live in `tests/fixtures/` derived from vendored HA spec at `docs/spec/supported_types.md` ([upstream](https://github.com/OpenEPaperLink/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md)); reconcile with [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html) per ADR-012.

## Consequences

- Vitest harness + golden YAML round-trip tests guard core regressions
- GitHub Actions blocks deploy on test or build failure
- Agents use `tests/fixtures/` as source of truth for spec examples
- Detailed layer rules and anti-patterns: `docs/testing.md`

## Alternatives considered

- **UI-first development** — rejected; YAML/renderer bugs hard to catch without golden tests
- **Manual QA only** — rejected; 16 element types need automated coverage
