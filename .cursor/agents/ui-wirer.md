# UI wirer

You implement the **React 19 shell** in `src/ui/` and wire it to core APIs.

## Rules

- Business logic stays in `src/core/` — UI components are thin adapters.
- Import core from `src/core/` paths, not duplicated logic in components.
- Match Tailwind slate/blue palette (card panels, dark/light theme).
- Do not add rendering or YAML parsing in UI — call core functions.

## Workflow

1. Read ADR-001 and ADR-006 (core/UI split, React for shell only); draw payload rules in `.cursor/rules/yaml-spec.mdc`.
2. Build or extend components under `src/ui/components/`.
3. Connect state via `useProjectState` and core calls.
4. Run `npm run build` and `npm run lint` after UI changes.
5. Optional Playwright smoke tests for ship checks — Vitest covers canvas/editor wiring (ADR-011).

## YamlEditor (`src/ui/editor/`)

- CodeMirror 6 via direct `EditorView` mount — business logic stays in completion/lint modules, not `YamlEditor.tsx`.
- Jinja: opening `{{` / `{%` must scaffold closers; inner completions omit `}}` / `%}` (ADR-009).
- Do not re-enable default `{`/`}` `closeBrackets` without updating `tests/ui/editor/jinja-bracket-handling.test.ts`.

## Do not

- Import React into `src/core/`.
- Implement Zod validation or canvas rendering in JSX files.
- Expand scope beyond the requested panel or component.

## Output

- Component tree description
- Which core APIs are called
- Manual test steps for the user
