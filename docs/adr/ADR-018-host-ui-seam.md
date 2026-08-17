# ADR-018: Host UI seam — targets, state catalog, actions, preview provider

## Status

Accepted — maintainer ruling 2026-08-15, from upstream
[PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
collaboration with @jonasniesner. Extends [ADR-017](ADR-017-host-adapter-seam.md)
(host-adapter seam) and [ADR-010](ADR-010-ha-embed-mode.md) (embed mode).
Revised 2026-08-16 with the 2.0 forward-only rulings (no live consumers exist;
PR #100 was exploration — design for the best interface, not for migration).
Amended 2026-08-16: the [display-config lock](../embedding.md#display-config-lock-issue-70)'s
scope is dimensions and color mode/palette **only** — rotation is a user
choice (portrait mounting of the same physical display) and stays editable
while locked. (It read "on both display channels" when there were two; at 2.0
`targets` is the only one.)
Amended again (issue #139): rotation means the **orientation of the logical
drawing surface** — a quarter turn swaps the canvas W/H and the designer
presents that surface upright, always. `render_*`/`pixel_*` seeding is
unchanged and still correct; what changed is that nothing downstream re-applies
the rotation as a transform.

Amended 2026-08-16 (2.0 auto-adoption rule, ruled with the cut below): **until
the user makes a display choice, the designer mirrors the host — one declared
display = adopted + locked, several = open picker.** It holds for every push,
not only the mount option: pre-choice, a single-display push re-pins to that
display, and a list narrowing to one adopts it. A display choice of the user's
(a pick, "Virtual display", the lock) ends mirroring for good; picking an id the
host's current list no longer offers is a **no-op, not a choice**. A push made
from inside `onTargetSelected` is deferred until that notification returns and
coalesced to the latest one, so the reaction pattern this ADR teaches cannot
re-enter the push applier.

**Executed at 2.0** ([issue #121](https://github.com/schlomo/odl-drawcustom-designer/issues/121)):
every "at 2.0" clause below has shipped as one `feat!:` cut — the targets seam
subsumed the `capabilities`/`setCapabilities`/`lock` channel (a one-element
`targets` push is adopted and locked with no pick), `onSaveRequest` and the
built-in Save button are gone in favour of the actions seam, and
`HostEntityState` is `HostState`. The 1.x transition text kept below — the two
coexisting display channels, their last-write-wins precedence, the anonymous
"Host display" entry, the two mapping bases — is **historical record, not
current behavior**; the live contract is [`docs/embedding.md`](../embedding.md).

## Context

[PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
is the first external consumer to embed the designer (v1.0.2) into a real
host. Its author hand-built a host-side toolbar (vanilla JS, untested) on top
of today's mount API — a display picker, a "Copy YAML" button, a "Send"
button hardcoding service options the embed contract has no seam for. Drift
showed up immediately: the host toolbar's Copy YAML and the designer's own
Copy YAML button quote YAML differently, so the two visibly disagree on the
same payload.

The upstream author's request: move these top-bar functions **into** the
designer — entity autocomplete, missing-entity highlighting, a dry-run
preview overlay — and delete the host toolbar entirely, rather than
converging on a shared vanilla-JS chrome. Both maintainers agree: the
designer owns UI, the host provides data and callbacks. A **chromeless**
mode (designer supplies no chrome, host builds all of it) was considered and
rejected — it is the status quo that produced the drift, just formalized.

Four gaps surfaced concretely from PR #100:

1. **Save button silently hangs.** [`MountHandle`](../../src/embed/types.ts)
   has no way to read the current payload, so PR #100 DOM-scrapes the
   designer's shadow root for the Save button and simulates a click
   (`_clickSave()`). When a YAML error disables Save
   ([`src/ui/App.tsx`](../../src/ui/App.tsx), `disabled={yamlBlocked}`), the
   scrape still *finds* the button, but `click()` on a disabled button emits
   no callback — the host reports "Saving…" and hangs. The fix is read access
   to the payload (`getPayload()`), not better button discoverability.
2. **Send hardcodes service options.** `onSaveRequest` yields element YAML
   only; PR #100's Send hardcodes `background: 'white'` and
   `dither: 'ordered'` because it has no seam to carry the options the
   payload actually needs (their service default is `burkes`, not
   `ordered`) — designs transmit differently than they preview.
3. **No display picker seam.** Target selection is host-only chrome bolted
   outside the designer, so it cannot participate in the existing
   [display-config lock UX](../embedding.md#display-config-lock-issue-70)
   ([ADR-017](ADR-017-host-adapter-seam.md)).
4. **No preview provider seam.** The dry-run render PR #100 wants sits
   next to the designer's client-side preview with no shared seam, and no
   path to reuse it as an [ADR-007](ADR-007-hybrid-rendering.md) parity
   reference.

## Decision

Four additive seams on the existing [`DesignerHost`](../../src/embed/host.ts)
data contract — no new lifecycle, no new adapter shape:

- **Targets** — the host pushes `targets: [{ id, label, capabilities }]`
  (`id` opaque); the designer renders a display picker inside its own
  display-config area. Selecting a target locks to its capabilities, using
  the existing lock UX unchanged — unlocking still means "virtual display,"
  it does not forget the selection. The target id round-trips opaquely
  through callbacks (`onAction` carries it); the designer never learns what
  it names. Targets are **hot-updateable** (`setTargets(next)`) — a display
  added on the host side appears in the picker without a reload. If a push
  removes the currently-selected target, the designer **keeps the last-known
  capabilities and marks the selection stale** ("display no longer
  available") and offers the picker — it never silently switches or unlocks.
  At 2.0 the targets seam **subsumes** the `capabilities`/`setCapabilities`/
  `lock` channel entirely: a single-display host passes a one-element
  `targets` array (auto-selected, locked); "virtual display" is a picker
  state, not an option flag.

  *Shipped shape* (issue #106, `docs/embedding.md`):

  - **The two display channels coexist through 1.x with a stated precedence.**
    A bare `capabilities` push is an **anonymous target**: a real display that
    carries no id, behaving exactly as it always has (adopt + lock, or seed
    unlocked with `lock: false`), and the picker names it "Host display".
    Pushing `targets` declares only what the user *can* pick — it never moves
    the canvas by itself, and nothing is auto-selected in 1.x (auto-selection
    belongs to the 2.0 subsumption, not to two consecutive behaviors). An
    explicit pick selects a named target and wins over the anonymous display;
    a later `capabilities` push wins back and clears the named selection.
    **Last write wins; the channels never merge** — in particular, pushed
    capabilities are never matched against a target's capabilities to infer
    which display they are, since that would guess at the identity the seam
    deliberately keeps opaque.
  - **Lock state and selection are one control, not two.** Selecting a target
    adopts its capabilities through the same mapping the `capabilities` channel
    uses (one display pipeline) and locks the display config — the issue #70
    lock UX unchanged. "Virtual display" *is* the lock's open state: picking it
    and clicking the lock open are the same action, and the selection survives
    it, so re-locking returns to the selected target. What the picker reads is
    therefore always the display the design is pinned to right now.
  - **One mapping, two bases** (maintainer ruling 2026-08-16). The channels
    share `capabilitiesToCanvas` but resolve it against different bases, and
    that difference is the whole of what "anonymous display" versus "named
    display" means:

    | channel | base | rationale |
    |---------|------|-----------|
    | `capabilities` push | the **current canvas** (`capabilitiesToCanvas`) | a partial push re-asserts *some* facts about the display already in effect — `{ rotation_degrees: 90 }` re-declares its orientation |
    | `targets` pick | the **designer defaults** (`targetCapabilitiesToCanvas`) | picking names a *different* display; the same target must yield the same canvas whatever preceded it, and inheriting the previous display's rotation or measured `color_map` corrupts ADR-007 parity |

    The preview dither mode is designer-only and survives both, as it survives
    the lock.
  - **A re-push of the selected target's capabilities re-applies.** The host
    re-defining the display the design is pinned to is the same event a
    `setCapabilities()` push carries, so it lands the same way: canvas follows
    (canonical base) and stays locked; unlocked, the values are stored and
    re-locking applies them. A relabel alone moves nothing.
  - **Lock scope excludes rotation** (amendment, maintainer ruling
    2026-08-16). The lock covers dimensions and color mode/palette only —
    rotation is a user choice (portrait mounting), stays editable while
    locked on both channels, and changing it never unlocks or clears a
    selection. The re-apply and re-lock rules above therefore both carve
    rotation out: a re-push preserves a rotation the user changed since
    picking the target and only adopts the target's freshly-declared rotation
    when the user left it untouched since that pick; re-locking restores the
    locked dimensions/palette but leaves rotation exactly as it currently is,
    since it was never lock-owned. Because rotation orients the drawing
    surface (issue #139), both of those paths restore the display's two
    dimensions **in the orientation the user is holding** — the lock owns the
    panel, the user owns which way round it goes. The anonymous `capabilities` channel keeps
    its existing, simpler rule unchanged (a pushed `rotation_degrees` always
    wins) — it has no "pick" to baseline against, and it dies at 2.0 (issue
    #121). Its consequence for that channel: a push carrying
    `rotation_degrees` and **no** size fields adopts the rotation and keeps the
    dimensions, i.e. re-declares *those* dimensions as being in the pushed
    orientation — so the next turn of the canvas swaps them from there. Hosts
    that mean "different surface" push the sizes alongside, or use `targets`,
    which always carries both.
  - **Dimensions and rotation are one adopted fact** (issue #139 review). Every
    adoption — mount seed, `capabilities` push, target pick, re-push re-apply,
    re-lock — stores a display's two dimensions together with the rotation they
    are expressed in, and every re-orientation turns that pair as a unit; the
    helper takes the pair as a single argument so a rotation from one adoption
    can never be applied to dimensions from another. The host-side half of this
    contract: `rotation_degrees` must state the orientation `render_*` is
    **already** in (effective), never a base rotation still to be applied to
    them. The designer cannot detect a host that gets this wrong.
  - **`onTargetSelected(id | null)` is optional and fires on change only.** A
    host that merely needs the id when something happens reads `onAction`'s
    `context.targetId` (same value; `undefined` where the callback reports
    `null`). A host that *reacts* to the selection needs the notification —
    the reference case is re-pushing `actions` with a
    `disabledReason: 'No display selected'`, which the actions seam already
    documents as its live-state field. The two channels agree by rule: an
    unlocked (virtual) display reports no target on both.
  - **Keep-and-mark-stale is derived, not stored.** "Unavailable" is the
    selection no longer appearing in the pushed list, so pushing the display
    back heals the state by construction and no push can strand a stale flag.
    The removal changes nothing else on the designer side — canvas, lock and
    remembered selection all stay — but the *reported* target follows the
    host's own list: an id the host no longer offers is never handed back to
    it, so `onTargetSelected(null)` fires at that transition and
    `context.targetId` is `undefined` until the display returns. The stale
    label stays visible; it addresses the user, not the host.
- **State catalog** — states gain an optional friendly-name field; a new
  referenced-states panel shows only the states the current payload actually
  references, with host display names, as a compact visual aid. The full
  catalog remains reachable via YAML/template autocomplete, unchanged.
- **Actions** — `actions: [{ id, label, icon?, severity?, needsPayload?, disabledReason? }]`
  + `onAction(id, payload, { targetId })`. The designer renders the button list
  in its own chrome; meaning, auth, and the actual service call are entirely
  host-side. `severity: 'normal' | 'caution' | 'danger'` maps to regular /
  orange / red button chrome (the HA Send-to-display is `caution` — it
  drives physical hardware). Disabled actions render visibly disabled with
  `disabledReason` surfaced through the existing tooltip pattern. Actions
  are **re-pushable** — the host re-pushes the list to update
  `disabledReason`/labels live; the designer diffs. **The designer's own
  Save button is itself an action instance**: at 2.0, `onSaveRequest` and
  the built-in Save button are removed — the actions seam is the only
  save/send channel. This is deliberately **not** a plugin API: a typed,
  closed list of buttons, never host-rendered UI inside the shadow root.
  *Shipped shape* (issue #108, `docs/embedding.md`):

  - The opaque ids travel in a **context object** — `onAction(id, payload,
    { targetId })` — so the targets seam below is additive rather than a
    signature change.
  - `icon` is **any Material Design Icon name**, resolved exactly as the
    payload's `icon` element resolves it (`mdi:` prefix optional). One icon
    vocabulary, not two: the full MDI set is already bundled deliberately for
    the payload's icon element (bundle-audited, issue #22), so hosts get
    every name that element accepts at zero added size and with no icon
    dependency of their own. An unknown name is rejected at the push, the
    same behavior class as an unknown icon in the payload.
  - `needsPayload` (default `true`) says whether an action reads the design.
    A blocked YAML document disables only the actions that need the payload —
    an action that does not (host-side settings, a reconnect) stays clickable
    throughout.
  - `onAction` is **required** alongside a non-empty `actions` list. It is
    fixed at mount (functions are not pushed), so a mount without one could
    never take an action; both `mount()` and `setActions()` reject rather
    than render permanently inert buttons.
- **Preview provider** — `renderPreview(payload, targetId) => Promise<image>`,
  optional; when present the designer offers a server-rendered dry-run as an
  overlay/compare view next to its own client preview. The HA adapter
  implements this via drawcustom's dry-run path, and it doubles as the
  [ADR-007](ADR-007-hybrid-rendering.md) pixel-parity reference — a real
  Pillow render to diff against, not another client approximation.

### Seam grammar

Every seam above follows one shape, and any future addition must fit it:

- **Data flows in as typed pushed values** (`targets`, `states`, host-side
  `renderPreview`) — the direction `states` and `targets` already run in.
- **Intent flows out as callbacks carrying payload plus opaque ids**
  (`onAction(id, payload, { targetId })`, `onTargetSelected(id | null)`) — the
  designer reports what the user did and hands over the current payload; it
  never exposes a second, action-specific save channel.
- **A callback may push back.** Reacting to `onTargetSelected` / `onAction` with
  another push is supported by design, so every push channel that can be
  reached from its own notification must defer the re-entrant push and coalesce
  it (latest wins) rather than apply it inside the notification — the targets
  channel does this in `useProjectState`.
- **No bidirectional shared state.** The host never reads designer internals
  back out except through these typed values; the designer never reaches
  into host state.
- **No host code inside the shadow root, ever.** Actions are a typed button
  list, not a slot.
- **Mount options are atomic initial pushes.** `mount(el, { states })` is
  defined as `mount(el)` + `setStates(states)` applied before the first
  painted frame — same types, same semantics (the commit-time registration
  from [ADR-017](ADR-017-host-adapter-seam.md)/issue #115 makes the
  equivalence exact). Options stay for one-shot setups (a designer embedded
  in a single display's details page); **everything pushed at mount is
  re-pushable on the handle; functions are stable closures** with no update
  channel.
- **Read and push channels register together, at commit.** No window may
  exist where a push is already visible but a handle read (e.g.
  `getPayload()`) still answers from stale bootstrap.
- **Vocabulary stays domain-neutral.** "Target", "display", "state" —
  never "entity", "hass", "service". The designer must stay meaningful to a
  non-HA host. The 2026-08-16 forward-only ruling dissolves the earlier
  grandfather clause: legacy "entity"-named published types
  ([`HostEntityState`](../../src/embed/types.ts)) are renamed at 2.0.

**Litmus test for any addition to this seam:** a non-HA host must be able to
implement it meaningfully, *and* the UI it drives must be testable in Vitest
against a fake adapter. Enforcement lives in the demo host page
([`demo/`](../../demo/), [`docs/embedding.md`](../embedding.md)): it implements
all four seams with mocks and is the e2e harness (`tests/e2e/embed-*.spec.ts`).
If a feature can't be expressed on the demo page, the abstraction is wrong —
fix the abstraction before adding a host-specific escape hatch.

### Simulator policy

When a host feeds live states, the State Simulator is disabled entirely — it
is a standalone/demo-adapter feature ([ADR-017](ADR-017-host-adapter-seam.md)),
not a preview layer to reconcile against live data. The referenced-states
panel above replaces it for embedded hosts; the full state catalog stays
available through YAML/template autocomplete either way. This resolves the
precedence question [issue #24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)
parked between "Simulator overrides live states" and "Simulator hidden when
embedded" — the answer is the latter, plus a purpose-built replacement rather
than a hidden Simulator with no substitute.

## Consequences

- Seams may land 1.x-additive as convenient, but **all breaking removals
  batch into one `feat!:` PR** (issue
  [#121](https://github.com/schlomo/odl-drawcustom-designer/issues/121)) —
  a single clean 2.0.0 under [`docs/releasing.md`](../releasing.md)'s
  automation. No compat shims, aliases, or deprecation windows in between:
  nothing is live, the upstream PR gets updated against the final interface.
- [Issue #24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)'s
  open precedence question is resolved by the Simulator policy above.
- The preview provider seam becomes the [ADR-007](ADR-007-hybrid-rendering.md)
  parity reference: a real server-side render available inside the designer's
  own preview, not a separate tool.
- Host panels stay thin: a host wires typed data in and typed callbacks out,
  with no UI to build or keep in sync — cheap for the two additional hardware
  vendors already in the pipeline behind PR #100.
- [Issue #25](https://github.com/schlomo/odl-drawcustom-designer/issues/25)'s
  scope shifts from building the panel wrapper from scratch to supporting
  PR #100 through these seams (see the issue comment linking this ADR).
- The demo host page ([`demo/`](../../demo/)) grows mocks for all four seams
  and stays the e2e harness proving them — including a **live mutating state**
  (per-second ticker via `setStates`, issue
  [#119](https://github.com/schlomo/odl-drawcustom-designer/issues/119)) so
  the push channel is demonstrated and exercised, not just seeded once.

## Alternatives rejected

- **Chromeless/headless mode** (host builds all chrome, designer stays a bare
  canvas) — rejected: this is the status quo that produced the Copy-YAML
  drift; the upstream author explicitly asked to move chrome *into* the
  designer instead. Shipping both a chromed and a chromeless variant is a
  permanent two-chrome drift class, not a fix for the one that already
  happened.
- **Generic plugin/extension API** (host registers arbitrary components or
  render slots) — rejected: unbounded surface, defeats the litmus test (no
  way to say a non-HA host "implements it meaningfully" against an open
  slot), and reopens the shadow-root isolation guarantees
  ([ADR-017](ADR-017-host-adapter-seam.md), [`docs/embedding.md`](../embedding.md#shadow-dom-at-the-mount-boundary-issue-21))
  the mount boundary exists to hold.
- **Host-rendered UI slots inside the shadow root** — rejected: breaks style
  isolation the shadow boundary guarantees, and reintroduces domain bleed
  (HA-specific markup/CSS living inside designer chrome) that the seam
  grammar's domain-neutral vocabulary rule exists to prevent.
