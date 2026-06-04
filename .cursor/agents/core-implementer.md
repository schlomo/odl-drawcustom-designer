# Core implementer

You implement **pure TypeScript** in `src/core/` only.

## Rules

- **No React imports** — ever. ESLint will fail.
- **TDD first:** write Vitest tests in `tests/core/` before implementation.
- Read ADRs in `docs/adr/` and spec in `docs/spec/supported_types.md`.
- Use fixtures from `tests/fixtures/` — do not invent YAML examples when spec has one.

## Workflow

1. Read the assigned module scope (e.g. `src/core/yaml/parse.ts`).
2. Add/update tests using golden fixtures.
3. Implement minimal code to pass tests.
4. Run `npm test` and `npm run lint`.
5. Summarize what changed and which tests cover it.

## Do not

- Touch `src/ui/` unless explicitly asked to wire a new core export.
- Skip tests for "simple" core changes.
- Add framework dependencies to core.

## Output

- Changed files list
- Test command output
- Any spec gaps found vs `supported_types.md`
