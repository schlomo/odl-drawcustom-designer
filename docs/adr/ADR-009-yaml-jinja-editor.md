# ADR-009: YamlEditor — CodeMirror 6, Jinja scaffolding, and editor UX

## Status

Accepted (Phase 2b, validated in user testing 2026-06-05)

## Context

The bottom YAML panel is a primary editing surface for drawcustom payloads. Values often embed Home Assistant Jinja templates (`{{ … }}` expressions and `{% … %}` statements) inside quoted or unquoted YAML strings.

We adopted the HA frontend editor stack in spirit: CodeMirror 6, `@codemirror/lang-yaml`, `@codemirror/lang-jinja`, `@codemirror/autocomplete`, `@codemirror/lint`. Early integration via `@uiw/react-codemirror` caused extension re-init churn; default CodeMirror `closeBrackets` for `{`/`}` fought Jinja delimiter syntax; autocomplete and lint tooltips failed on the first list item; and mixing delimiter auto-close with inner snippet completions produced malformed templates (stray `}`, missing `}}`, double spaces).

User testing with screen recordings drove several iterative fixes. This ADR records the stable behavior contract so we do not regress it.

## Decision

### Editor shell

- Mount **CodeMirror 6 directly** via `EditorView` in `YamlEditor.tsx` — not `@uiw/react-codemirror`.
- Keep editor wiring in `src/ui/editor/` (UI only). Completion metadata comes from `src/core/schema/`; template entity IDs from the scanner when wired.
- Use `@uiw/codemirror-extensions-basic-setup` for line numbers, history, etc., but **disable** its bundled `autocompletion` and `closeBrackets` — we supply custom extensions.

### YAML + Jinja parsing

- Use `yamlLanguage` with a **mixed parser** (`parseMixed`): Jinja parses inside YAML string literal nodes (`QuotedLiteral`, `Literal`) so `{{` / `{%` highlight correctly in values.
- Jinja autocomplete and lint run only when the cursor is inside a template delimiter pair or at a deliberate template entry point (see `jinjaContext.ts`).

### Bracket closing policy

- **Do not** use CodeMirror default `{`/`}` auto-close in this editor.
- Re-enable `closeBrackets` for `()`, `[]`, `'` and `"` via `languageData` (`jinjaBracketHandling.ts`). Single and double quotes pair automatically; curly braces remain Jinja-scaffolded only.
- Jinja open delimiters are completed by a dedicated input handler and delimiter completions, not generic bracket pairing.

### Jinja delimiter scaffolding (core UX contract)

Opening a template always inserts **both** delimiters; inner autocomplete never repeats closers.

| User action | Result | Cursor after action |
|-------------|--------|---------------------|
| `{` then `{`, or autocomplete `{{` | `{{ }}` | Inside expression (after `{{ `) |
| `{` then `%`, or autocomplete `{%` | `{% %}` | Immediately after `{%` |
| Expression completion (e.g. `states`) | `{{ states('') }}` | Snippet omits `}}` |
| Statement completion (e.g. `set`) | `{% set name = value %}` | Snippet omits `%}`; one leading space after `{%` |

Scaffold insert strings (after the user's first `{`):

- `{{` → `{ }}` (yields `{{ }}`)
- `{%` → `% %}` (yields `{% %}`)

Statement tags offered inside `{% … %}`: `set`, `if`, `elif`, `else`, `endif`, `for`, `endfor`.

Expression helpers inside `{{ … }}`: `states`, `is_state`, `state_attr`; filters `float`, `int`. Statement keywords are **not** offered inside `{{ … }}`.

### Spacing when applying inner completions

The scaffold leaves a **single placeholder space** before the closing delimiter. Inner completions must preserve Jinja spacing conventions:

- **Expressions:** when replacing that placeholder space (or inserting at it with an empty range), pad to ` … ` so both `{{ ` and ` }}` retain one space.
- **Statements:** tag snippets use a **leading space** after `{%` (e.g. ` set name = value`); the scaffold space before `%}` stays untouched.

Do not add a separate “close `%}`” completion — the scaffold already provides the closing tag.

### Schema autocomplete and lint

- YAML schema completions (types, keys, enums) use `yamlCompletions.ts` / `yamlCompletionSource.ts` with correct `from` offsets for `type:`, list items, and enum value lines.
- Lint maps Zod issues to document ranges in `yamlIssueRanges.ts`:
  - Unrecognized / typo keys → squiggle on the **key**
  - Invalid enum **values** → squiggle on the value
- Tooltips render with `tooltips({ parent: document.body, position: 'fixed' })`.

### Tooltip / scroll peculiarity (first list item)

Autocomplete and lint tooltips disappeared on the **first YAML list item** while later lines worked. Root cause: global `EditorView.scrollMargins` inset the tooltip anchor Y so CodeMirror hid popups near the top of the viewport.

- **Fix:** remove global `scrollMargins`; use per-navigation `scrollIntoView(..., { yMargin: 24 })` only when jumping from canvas selection to a YAML line.
- **Not the cause:** linked YAML↔canvas coupling mode (confirmed by user testing).

### Linked YAML↔canvas coupling

- Optional linked mode syncs element list and scroll/highlight between canvas selection and YAML (`yamlElementsSync.ts`, `locateElementInYaml.ts`).
- Independent of CodeMirror tooltip positioning.

### Selection stability when the element list changes (layer reorder)

Layer buttons (Front / Back / ↑ / ↓), drag-reorder in the layer list, and YAML block moves all change **array index** without changing element identity. Linked mode must keep the **same element** selected for the property panel, canvas handles, and YAML cursor.

**Failure mode (fixed 2026-06-07):** calling `setSelectedIndex` inside a `setElements` updater schedules selection **after** the elements commit. React can render one frame with **reordered `elements` + stale `selectedIndex`**. In linked mode, `YamlEditor` then runs external doc sync with `preserveLinkedElementIndex` pointing at the **old** index — which now refers to a **different** element (often the front item in the layer list). YAML cursor coupling can permanently steal focus from the element the user was editing.

**Required pattern for UI mutations that reorder or replace the payload array:**

1. Compute the next selection with `remapIndexAfterMove(selected, fromIndex, toIndex)` (or equivalent) **before or alongside** the array update — never nested only inside the `setElements` updater.
2. Apply `setSelectedIndex` / `setSelectionSource('ui')`, then `setElements` in the **same event handler** so both commit in one batch (`applyLayerMove` in `useProjectState.ts`).
3. When YAML drives the change, use `remapSelectedIndex` in `yamlElementsSync.ts`:
   - Prefer **single-slot property edits** (one changed index at the selected row).
   - Detect a **single layer move** via `findSingleLayerMove` + `remapIndexAfterMove` (handles adjacent swaps and duplicate elements where YAML identity match is ambiguous).
   - Do **not** keep selection at the same numeric index merely because `type` matches at that slot after a reorder.

**Tests:** `tests/ui/lib/selection-remap.test.ts`, `tests/ui/editor/yaml-elements-sync.test.ts` (layer-down and duplicate-element cases).

**Deferred:** full `useProjectState` batching via `useReducer` for undo/redo — selection+elements pairing above is the minimum contract until then.

## Consequences

- Regression tests live in `tests/ui/editor/` (14 files), including `jinja-bracket-handling.test.ts`, `jinja-completions.test.ts`, `yaml-tooltip-visibility.test.ts`, `yaml-issue-ranges.test.ts`.
- Re-enabling default `{`/`}` `closeBrackets` or putting closing delimiters in inner snippet `apply` strings will break user-tested flows — update tests first.
- HA-clean export rules unchanged (ADR-002): autocomplete must not corrupt template strings in serialized YAML.
- Future editor work (entity ID completions from State Simulator, service-option keys) should extend existing providers, not replace the scaffolding model.
- Any new code path that mutates element order or length must update selection with the remap helpers above; regressions show up as property-panel focus jumping to the wrong element, especially in linked YAML mode.

## Alternatives considered

- **Default CodeMirror `closeBrackets` for `{`/`}`** — rejected; produces `{%}` / orphaned `}` and blocks `{{` / `{%` entry.
- **Inner snippets include `}}` / `%}`** — rejected; duplicates closers when combined with scaffolding; inconsistent with `{%` path.
- **No delimiter scaffolding; user types full delimiters** — rejected; high error rate; HA template editor affordance is paired delimiters.
- **Keep `@uiw/react-codemirror`** — rejected; unstable extension lifecycle caused sync and completion bugs.
- **Global `scrollMargins` for linked scroll** — rejected; breaks top-of-document tooltips; use targeted `scrollIntoView` instead.
- **Full Jinja2 autocomplete in editor** — deferred; editor offers HA drawcustom subset; full evaluation remains in core templates (ADR-004).

## References

- `src/ui/editor/` — CodeMirror extensions, completions, lint, YAML↔canvas coupling
- ADR-004 (template evaluator scope in core, separate from editor completions)
- ADR-006 (React shell; editor stays in `src/ui/`)
