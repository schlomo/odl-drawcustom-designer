# ADR-009: YamlEditor — CodeMirror 6, Jinja scaffolding, and editor UX

## Status

Accepted

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

Expression helpers inside `{{ … }}`: `states`, `is_state`, `state_attr`, `is_state_attr`; filters `float`, `int`. The first argument of `state_attr`/`is_state_attr` triggers entity-id completion like `states`/`is_state`. Statement keywords are **not** offered inside `{{ … }}`.

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

### Element index ↔ YAML offset mapping (AST-backed, single source of truth)

**Failure mode (fixed 2026-07, issues #14/#15/#16):** element↔text position mapping was a regex line scanner — `findListItemSpans` in `yamlIssueRanges.ts` matched `/^-\s/` at column 0 per line. This diverged from the real YAML parser (`parseYamlPayload`, which discards all source-position metadata) in ways that produced two selection-sync bugs:

- **Flow-style top-level arrays** (`[{...}, {...}]`) parse to N elements via `yaml.parse`, but the regex scanner found zero `- ` lines and returned zero spans. `locateElementStartInYaml` / `locateElementFocusInYaml` returned `null` for every index, so canvas→YAML jump silently no-opped (issue #15).
- **Comments and blank lines** between elements were folded into the *preceding* element's span (the scanner set `item[i-1].end = item[i].start`, swallowing everything between), so clicking a comment line highlighted the wrong element.

**Fix:** `src/core/yaml/elementSpans.ts` is now the single source of truth for element-index ↔ source-offset mapping, backed by the `yaml` package's `parseDocument` AST node ranges (`node.range = [start, valueEnd, nodeEnd]`) — the same parser `parseYamlPayload` uses, so the two can never structurally disagree.

- `findElementSpans(source)` returns `{ index, start, end }` per top-level array item. Block-style items (`- type: …`) start at the line containing the `-` marker; flow-style items (`{...}`) start at the item's own value. Comments/blank lines between items belong to **neither** element (they fall in the gap between one item's own `end` and the next item's `start`) — a cursor there resolves to `null` instead of the previous element.
- `elementIndexAtOffset(source, offset)` is the offset→index direction.
- `yamlIssueRanges.ts`'s `findListItemSpans` is now a thin wrapper over `findElementSpans` (kept for its existing diagnostics callers); `locateElementInYaml.ts`, `yamlEditorScroll.ts`, and `yamlLinkedElement.ts` all import the mapping from the core module (via `src/core/index.ts`, per ADR-001) rather than re-deriving it.

**Tests:** `tests/core/yaml/element-spans.test.ts` (flow style both directions, comment/blank-line boundaries, multi-line Jinja block-scalar strings, duplicate elements).

### Cursor→selection race with the debounced, validation-gated `elements` array

**Failure mode (fixed 2026-07, issue #14):** `handleCursorPosition` in `YamlPanel.tsx` resolved a cursor position to an element index against the **live** CodeMirror doc synchronously on every cursor move, and called `onSelectElement` unconditionally. The committed `elements` array, however, only updates via `flushYamlElementsSync` behind an 80ms debounce **and** a whole-document `payloadSchema.safeParse` (`z.array(...)` fails atomically — one invalid element anywhere freezes the entire committed array at its last valid state). Mid-edit — even from an unrelated, momentarily-invalid field — the live doc's element count could disagree with the committed array's length, so `elements[selectedIndex]` pointed at the wrong element (or a shifted one, e.g. after inserting a new element above within the debounce window).

**Fix:** `resolveCursorSelection(liveDoc, cursorPos, committedElements, pendingElements)` in `src/core/yaml/resolveCursorSelection.ts` is a pure function `YamlPanel.tsx` calls instead of resolving the index itself:

- If the live doc's element count matches `committedElements.length`, the resolved index is trusted directly.
- If they disagree but the debounced-but-not-yet-flushed `pendingElements` parse already matches the live doc's structure, it returns `{ index, shouldFlushPending: true }` — `YamlPanel` flushes that pending parse synchronously (skipping the remaining debounce wait) before honoring the selection, so the property panel reads the freshest valid data.
- If neither matches, it returns `{ index: null, shouldFlushPending: false }` — the selection request is deferred rather than landing on a wrong element.

**Tests:** `tests/core/yaml/resolve-cursor-selection.test.ts` (structural mismatch defers; pending-parse reconciliation flushes and trusts the index; comment-gap positions defer; matching counts short-circuit without flushing).

### Blocked visual editing while the YAML doc is broken (issue #35)

**Failure mode (fixed 2026-07, issue #35):** while the live editor document was broken (e.g. a deleted `:`), `elements` stayed frozen at its last-valid state (atomic Zod gate), but the external-sync effect in `YamlPanel.tsx` re-ran on *any* dependency change (`canvasDragging`, `propertyEditing`, `couplingEnabled`, `serialized`) and unconditionally rewrote the editor with the stale serialization. A canvas pointerdown (toggles `canvasDragging`) or a property-field focus/blur (toggles `propertyEditing`) silently replaced the user's in-progress edit with the last-valid YAML — data loss.

**Maintainer ruling (2026-07-17):** rather than only guarding the overwrite, **visual editing is visibly blocked while the YAML is broken.** The YAML editor stays fully active (it is the only surface that can fix the document); the canvas and property panel show a clear blocked state and accept no interactions until the document parses again. This also settles the reconciliation policy: canvas edits can never race a broken doc, so nobody's edit has to lose.

Contract:

- **Derived signal:** `yamlBlocked` = the live editor doc currently fails `tryParseYamlElements` (`isYamlDocBlocked` in `yamlElementsSync.ts`) — parse errors *and* schema validation failures both freeze `elements`, so both block. Derived in `YamlPanel` from the live `yamlText` and bubbled to `App` via `onYamlBlockedChange`.
- **Interaction blocking is immediate:** while `yamlBlocked`, `DesignerCanvas` ignores pointer-down and canvas keyboard shortcuts (`blocked` prop), and the property panel's controls are disabled (`<fieldset disabled>`).
- **The visual blocked state is debounced:** the overlay appears only after `yamlBlocked` has held for `YAML_BLOCKED_GRACE_MS` (400 ms, `useYamlBlockedVisibility.ts`) so normal typing through transient-invalid states doesn't flicker it; it clears immediately when the doc parses again. Canvas shows a dimmed overlay with "YAML has errors — fix to continue editing visually"; the property panel shows the same message.
- **An external echo must never rewrite newer editor text.** The external-sync effect in `YamlPanel.tsx` skips whenever the editor holds content `elements` has not caught up with: while the doc is broken (`elements` frozen at last-valid) *and* while a valid parse is pending the 80 ms debounce (the editor is ahead of `elements`). Both states are read via **refs, not effect dependencies** — their flips must never re-trigger the effect. (Follow-up fix 2026-07-18: `yamlBlocked` was initially a dependency, so the blocked→unblocked transition mid-typing re-fired the echo with a stale `serialized` — erasing `0` from `y: 0` and typing `30` produced `00`.)
- **Custom completion `apply` functions must dispatch with a `userEvent` annotation** (e.g. `input.complete`): `shouldReportYamlDocChange` deliberately ignores unannotated (programmatic) transactions, so an unannotated completion insert leaves React's `yamlText` — and everything derived from it (elements sync, lint banner, the blocked state) — frozen at the pre-completion document. (Follow-up fix 2026-07-18: the element-type completion's apply was unannotated; accepting it left the canvas locked with a stale "validation errors" banner even though the visible doc was valid.)

**Tests:** `tests/ui/components/yaml-panel-blocked-sync.test.tsx` (real `EditorView` mount: dep toggles never rewrite a broken doc; blocked-state bubbling; type-completion accept unblocks and syncs; typing through a transient invalid state keeps typed text; drag toggle during the debounce window keeps newer text), `tests/ui/hooks/use-yaml-blocked-visibility.test.ts` (grace-period timing, fake timers), `isYamlDocBlocked` cases in `tests/ui/editor/yaml-elements-sync.test.ts`, and the e2e flow `tests/e2e/yaml-blocked-state.spec.ts` (break YAML → overlays appear, canvas clicks inert, edit not reverted → fix YAML → editing resumes).

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

**Deferred:** full `useProjectState` batching via `useReducer` for undo/redo — selection+elements pairing above is the minimum contract for now.

## Consequences

- Regression tests live in `tests/ui/editor/` (14 files), including `jinja-bracket-handling.test.ts`, `jinja-completions.test.ts`, `yaml-tooltip-visibility.test.ts`, `yaml-issue-ranges.test.ts`.
- Re-enabling default `{`/`}` `closeBrackets` or putting closing delimiters in inner snippet `apply` strings will break user-tested flows — update tests first.
- HA-clean export rules unchanged (ADR-002): autocomplete must not corrupt template strings in serialized YAML.
- Future editor work (entity ID completions from State Simulator, service-option keys) should extend existing providers, not replace the scaffolding model.
- Any new code path that mutates element order or length must update selection with the remap helpers above; regressions show up as property-panel focus jumping to the wrong element, especially in linked YAML mode.
- Element↔offset mapping is centralized in `src/core/yaml/elementSpans.ts` (AST-backed, ADR-001 core placement) — do not reintroduce a regex line scanner for element boundaries; extend the AST mapping instead. Regression tests: `tests/core/yaml/element-spans.test.ts`, `tests/core/yaml/resolve-cursor-selection.test.ts`.

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
