# Claude Code

Read **[`AGENTS.md`](AGENTS.md)** first — it is the canonical instruction set for this repo.

**Non-negotiable summary:**

1. Read relevant **ADRs** (`docs/adr/`, especially ADR-007 rendering, ADR-008/011 testing) before implementing.
2. **TDD** — behavior tests in `tests/core/` or `tests/ui/` that fail before your fix; no implementation-only assertions.
3. **HA preview parity** — renderer/export changes need outcome tests (geometry, pixels, export), not markup string checks.
4. **No React** in `src/core/`.
5. Run `npm test` and `npm run lint` before finishing.
6. Run `npm run build` before committing.

Full detail: [`AGENTS.md`](AGENTS.md) · [`docs/testing.md`](docs/testing.md)
