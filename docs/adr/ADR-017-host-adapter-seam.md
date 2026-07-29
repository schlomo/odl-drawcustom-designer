# ADR-017: Host-adapter seam (one mount lifecycle)

## Status

Accepted — implemented in issue #72 (maintainer ruling 2026-07-20). Extends
[ADR-010](ADR-010-ha-embed-mode.md) (embed mode) and
[ADR-006](ADR-006-ui-framework-react.md) (React shell).

## Context

Issue #20 made the designer embeddable and PR #67 split mounting in two:
`mountStandaloneApp()` (`src/embed/standalone.tsx`) and `mount()`
(`src/embed/mount.tsx`) became **sibling** functions over one App shell. Each
owned its own lifecycle: standalone did document-level theme, the async
IndexedDB/share-hash bootstrap and hashchange re-bootstrap; embedded did the
shadow root, stylesheet injection, container-scoped theme and the host push
queue. The React shell then split behavior on a single `embedded = host != null`
flag: autosave off, share link hidden, Save button shown, viewport vs container
height.

That is a drift class, not just duplication:

- Every lifecycle fix had to be applied twice, or silently applied to one
  runtime (the e2e suites cover both, so drift surfaces late and as a
  full-page bug: theme flash, lost session, page-scrolling embeds).
- `embedded` is a *mode*, so each new host meant another branch inside the
  shell. The M4 HA panel (issue #25) would have been a third mode.
- The standalone SPA — the runtime with real users — was the one path the
  embed test suites never exercised.

## Decision

**One mount lifecycle, three host adapters.**

`mountDesigner(container, host)` (`src/embed/mount.tsx`) is the single
lifecycle: DOM/render-target setup, the React root, bootstrap (sync or async,
including host-driven re-bootstraps) and the pre-registration push queue.
Everything that was a mode conditional is now policy declared by a
**`DesignerHost`** adapter (`src/embed/host.ts`):

| Member | Why it is host policy |
|--------|----------------------|
| `styleScope: 'shadow' \| 'page'` | Embedded needs bidirectional CSS isolation (issue #21); the standalone SPA must stay in the page DOM — its theme class lives on `document.documentElement`, which `.dark`-descendant selectors cannot cross a shadow boundary |
| `theme: { owner: 'designer' } \| { owner: 'host', value }` | Replaces three shell conditionals at once: apply-to-document, which theme the shell paints, and whether the theme toggle is offered |
| `fill: 'viewport' \| 'container'` | Shell height: full page vs host-sized container |
| `shareLink: boolean` | The share URL is the app's own URL (ADR-005) — an embedding host page has none |
| `persistence: DesignerPersistence \| null` | Session/mocks/variables writers. `null` = the host owns persistence (ADR-010). The M4 HA panel adapter can write HA storage without touching the shell |
| `onSaveRequest?` | Save channel; presence alone shows the Save button |
| `loadBootstrap()` | Initial state. Async for standalone (IndexedDB + `#d=` hash), synchronous for embedded — so invalid `payload` YAML still throws out of `mount()` |
| `subscribeBootstrapChanges?` | Host-driven re-bootstrap; standalone's same-tab `#d=` navigation. Embedded hosts push through `MountHandle` instead |
| `registerPushTarget?` | Supplied by the lifecycle (it owns the push queue), never by an adapter |

Adapters:

| Adapter | Module | Runtime |
|---------|--------|---------|
| Standalone | `src/embed/standaloneHost.ts` | GitHub Pages SPA — page DOM, document theme, IndexedDB persistence, share hash |
| Embedded | `src/embed/embeddedHost.ts` | What the public `mount(container, options)` builds — shadow DOM, host theme, no persistence, `onSaveRequest` |
| HA panel | M4, issue #25 | A third adapter (live states, HA-side persistence) — **not a third mode** |

The seam is **internal**. `DesignerHost` references internal types
(`AppBootstrap`, storage payloads), so it is deliberately not exported from the
library entry: publishing it would freeze designer internals under semver
(issue #23). The **embedded host API surface is unchanged** — `MountOptions`,
`MountHandle` and the host data contract are byte-for-byte the 1.0.0 shapes;
`mount()` is now just the embedded adapter's factory over `mountDesigner`.

### Conditionals that deliberately stayed declared data, not methods

`fill` and `shareLink` are booleans/enums on the adapter rather than adapter
methods: they always correlate with `styleScope` for today's two adapters, and
turning them into methods would be more machinery than the flag they replace.
Collapsing them into a single `mode` field would just rename the `embedded`
flag we removed — the point is that the shell reads *policy* and no longer
knows a mode exists. Debounce timing for persistence likewise stays in the
shell (`useProjectState`); the adapter supplies only the writers.

## Consequences

- **One lifecycle path.** The standalone SPA is the standalone adapter over
  `mountDesigner`; a lifecycle fix lands once. The embed test suites now cover
  the standalone wiring, and `tests/embed/standalone-host.test.tsx` pins the
  standalone-observable behavior (page DOM, document theme, IndexedDB autosave,
  `#d=` bootstrap and re-bootstrap, share link + theme toggle, no Save button).
- `mountStandaloneApp()` now returns a `MountHandle`, so a standalone mount can
  be torn down (`destroy()` also unsubscribes the hashchange listener — the
  leak that made two standalone bootstraps race over the same `#d=` hash in
  tests). `setTheme()` throws for a host that owns the theme preference rather
  than silently doing nothing.
- Document-level theme stays **adapter** code (`applyStoredDocumentTheme` in
  `src/embed/standalone.tsx`, plus `useThemePreference`'s
  `applyToDocument`): the shared mount internals still never touch
  `document.documentElement`, `document.head` or global theme (PR #67/#74).
- `App` and `useProjectState` now take a **required** `host`. Absent-host meant
  "implicitly standalone" — the exact default that could give an embedded mount
  document-level theming. Unit tests state which adapter they exercise
  (`createStandaloneHost()`), which is also better documentation.
- The M4 HA panel is an adapter file plus its live-state source; no shell
  changes, no third mode.

## Alternatives considered

- **Keep sibling mounts, share helpers** — rejected: the drift class lives in
  the lifecycle (bootstrap, theme, root setup), which is exactly what helper
  extraction leaves duplicated.
- **Expose the host seam publicly (`mount(container, { host })`)** — rejected:
  `AppBootstrap` and the storage payloads would become semver-frozen public
  API for one internal consumer.
- **Grow public `MountOptions` with async-bootstrap/persistence hooks so
  standalone uses the published `mount()` verbatim** — rejected for the same
  reason: it puts internal bootstrap shapes on the 1.0.0 surface. The internal
  `mountDesigner` gives the same single lifecycle with none of that cost.
- **Standalone renders into a shadow root too (fully uniform DOM)** —
  rejected: `.dark` on `document.documentElement` does not cross a shadow
  boundary, the page already links the stylesheet (injecting it again
  duplicates ~1.6 MiB gzip of assets), and every standalone e2e assertion
  about document scroll slack and page DOM would change meaning.
- **One `mode: 'standalone' | 'embedded'` field on the host** — rejected: that
  is the `embedded` flag with a new name; the shell would keep branching on
  identity instead of reading policy.
