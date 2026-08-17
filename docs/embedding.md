# Embedding the designer

The designer ships as an embeddable component ([issue #20](https://github.com/schlomo/odl-drawcustom-designer/issues/20), [ADR-010](adr/ADR-010-ha-embed-mode.md)): a host application — the concrete target is the [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44) custom panel — mounts it into a container, pushes entity states and display capabilities, and receives the drawcustom YAML payload on Save. Styles are isolated via Shadow DOM at the mount boundary ([issue #21](https://github.com/schlomo/odl-drawcustom-designer/issues/21)); live HA data is a later milestone ([#24](https://github.com/schlomo/odl-drawcustom-designer/issues/24)).

Consumed as a **versioned release** ([issue #23](https://github.com/schlomo/odl-drawcustom-designer/issues/23), npm publish added [issue #103](https://github.com/schlomo/odl-drawcustom-designer/issues/103)) — release procedure, semver policy, and full consumer story: [`docs/releasing.md`](releasing.md).

### Getting the library

**npm (primary):**

> **Status: live on npm.**
> `@schlomo/odl-drawcustom-designer` is published to the registry — scoped
> under the `schlomo` npm org. Versions include placeholder `0.0.1` (never install)
> and `1.2.0` (first automated release, 2026-08-16). **Known gap: `1.2.0` lacks
> the README** — it's restored for the next patch. The `npm install` command
> below is live now (see [`docs/releasing.md#npm`](releasing.md#npm)).

```bash
npm install @schlomo/odl-drawcustom-designer@^1.2.0
```

```js
import { mount, version } from '@schlomo/odl-drawcustom-designer'
```

Same self-contained ESM as below, plus `LICENSE`/`NOTICE`/`THIRD_PARTY.md` in
the package. No `.d.ts` types ship yet (known gap — plain JS, shapes
documented here and in `src/embed/types.ts`). Rationale (content-hash cache
invalidation, staged Trusted Publishing rollout) and the maintainer setup story:
[`docs/releasing.md#npm`](releasing.md#npm).

**GitHub release asset (fallback):** download the tagged release's
`odl-drawcustom-designer.js`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md`, and
`odl-drawcustom-designer.js.sha256` (verify with
`shasum -a 256 -c odl-drawcustom-designer.js.sha256` — `-a 256` matters,
bare `shasum -c` defaults to SHA-1), and vendor the ESM as a static file —
the path the OpenDisplay HA integration uses today.

## Library build

```bash
npm run build:lib
```

Emits **one self-contained ESM file** — React, styles, and bundled fonts included; the host provides nothing (~5.4 MiB raw, ~1.6 MiB gzip on the wire — composition and the deliberate no-code-splitting decision: [`docs/bundle-audit.md`](bundle-audit.md)):

```
dist-lib/odl-drawcustom-designer.js
```

`dist-lib/` also contains the demo host page (copied from `demo/`). Try it:

```bash
npm run build:site && npm run preview
# open the printed URL; the demo is at /embed/ (same path as production)
```

No dedicated server needed beyond that: the demo is plain static files, so any
static file server works too (e.g. `python3 -m http.server -d dist-lib`).

The demo page mounts the designer, pushes fake warm/cold states and a 296×128 BWR capabilities payload, offers three display targets (adding a fourth and removing the selected one on demand), registers three host actions (and re-pushes them to simulate a display going offline), switches themes, and shows every `onSaveRequest` payload, fired action and display selection in a `<pre>`. It doubles as the Playwright e2e fixture ([`tests/e2e/embed-mount.spec.ts`](../tests/e2e/embed-mount.spec.ts), [`tests/e2e/embed-actions.spec.ts`](../tests/e2e/embed-actions.spec.ts), [`tests/e2e/embed-targets.spec.ts`](../tests/e2e/embed-targets.spec.ts)).

The same demo is published from `main` at **<https://schlomo.github.io/odl-drawcustom-designer/embed/>** — `npm run build:site` assembles the deployed site (app at `/`, `dist-lib/` copied to `/embed/` by [`tools/assembleSite.ts`](../tools/assembleSite.ts)); PR previews get their own `/embed/` the same way.

## Mount API

```js
import { mount } from './odl-drawcustom-designer.js'

const handle = mount(document.getElementById('designer'), {
  payload: yamlString,          // initial drawcustom YAML (list of elements)
  states: { /* see below */ },  // initial entity states for template preview
  capabilities: { /* below */ },// display description -> canvas + palette
  lock: true,                   // optional, default true — see "Display config lock" below
  theme: 'dark',                // 'light' | 'dark', scoped to the container
  actions: [ /* see below */ ], // host buttons in the designer toolbar
  targets: [ /* see below */ ], // displays offered in the designer's picker
  onAction(id, payload, context) {
    // user clicked one of your buttons — do the host-side thing
  },
  onTargetSelected(targetId) {
    // user picked a display (or the virtual display: targetId === null)
  },
  onSaveRequest(payload) {
    // user hit Save — persist the YAML; the designer never writes it itself
  },
})

handle.setStates(states)                              // replace the entity-state map
handle.setCapabilities(capabilities)                  // re-map canvas size/rotation/palette, re-lock
handle.setCapabilities(capabilities, { lock: false })  // same, but leaves the controls unlocked
handle.setPayload(yamlString)                         // replace the payload (throws on bad YAML)
handle.setActions(actions)                            // replace the host action buttons
handle.setTargets(targets)                            // replace the displays in the picker
handle.getPayload()                                   // read the current payload YAML — see below
handle.setTheme('light')                              // switch the container-scoped theme
handle.destroy()                                      // unmount and empty the container
```

- The container needs an explicit height; the designer fills it (`height: 100%`).
- `mount()` and `setPayload()` throw synchronously on invalid YAML. A throwing
  `mount()` leaves the container exactly as it was — nothing rendered, nothing
  to clean up — so retrying into the same container is safe.
- Multiple mounts on one page are possible; each handle is independent — including per-instance light/dark themes.
- Pushes are safe from the moment `mount()` returns: a push made before the
  designer has rendered anything is queued and applied while it renders, so the
  first frame you can observe already reflects it. A host that pushes
  capabilities immediately after `mount()` never shows a frame of default,
  unlocked display config first (issue #115).

### `getPayload()` (issue #104)

`handle.getPayload()` returns the designer's current drawcustom YAML —
exactly the string `onSaveRequest` would receive if the user hit Save at that
instant. It exists so a host can *read* the payload directly instead of
simulating a Save click: the upstream OpenDisplay HA integration
([PR #100](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100))
DOM-scraped the designer's shadow root for the Save button and called
`.click()` on it, which silently did nothing whenever a YAML error had
disabled the button (see [ADR-018](adr/ADR-018-host-ui-seam.md)).

`getPayload()` reuses the exact same serialization path as `onSaveRequest` —
there is no second serializer to drift out of sync with it — and resolves
four edge cases so it can never disagree with what Save would send:

- **Before React has committed anything** (a synchronous call right after
  `mount()`/`mountStandaloneApp()` returns, before the mount's internal push/read
  registration effect has run): reports the **bootstrap payload** — the same
  `elements` the shell is about to seed its state from for a synchronous host
  (`mount({ payload })`), or a safe empty-list default while an async
  bootstrap (the standalone SPA's IndexedDB/share-hash load) is still in
  flight. Always a string, never `undefined`.
- **Mid-keystroke, while a debounced YAML edit is still pending:** the YAML
  editor commits typed text to the canvas model on an 80ms debounce (or
  immediately on blur). `getPayload()` forces that flush before reading, so a
  call made moments after typing reflects the already-typed text — matching
  a real Save click, which always blurs the editor (flushing the debounce)
  before it reads the payload. `getPayload()` never lags behind what a click
  would send.
- **While the YAML editor is blocked** by a parse/schema error (Save itself
  is disabled): returns the **last valid payload**. The canvas model
  (`elements`) freezes at its last-valid state while the live document is
  broken — the same state Save would have sent last, and, with Save
  disabled, the only way for a host to read anything at all.
- **Right after a `setPayload()` push, with an edit still pending:** the push
  wins. A host push is authoritative — it replaces the payload wholesale, so
  it also **discards** any debounced edit typed before it, and the editor is
  re-serialized from the pushed payload. Without that, the flush above (which
  `getPayload()` itself triggers) would have committed the pre-push draft over
  the payload the host had just pushed.

Like every other method on the handle, `getPayload()` throws
`MountHandle used after destroy()` once the mount has been destroyed. On a
live mount it never throws.

The payload read channel (`registerPayloadSource`) registers in the same
commit as the push channel (`registerPushTarget`) — both are `useLayoutEffect`
— so there is no window where a host push has already applied but a read
still reports stale, pre-push data.

### Version

```js
import { mount, version } from './odl-drawcustom-designer.js'

console.log(version)              // e.g. '1.2.3' in a released build, '0.0.0-dev' otherwise
console.log(mount(el, {}).version) // same value, also on the handle
```

`version` is baked in at build time (`tools/version.ts`) from the release
script's `APP_VERSION` environment variable — git tags, not `package.json`
(which stays pinned at `0.0.0`), are this project's version source. A build
that isn't produced by the release workflow (local dev, this repo's own GH
Pages app build) has no `APP_VERSION` set and reports `'0.0.0-dev'`. Same
string as `MountHandle.version`, whichever is more convenient for a host to
log or report. See [`docs/releasing.md`](releasing.md) for the release
procedure and semver policy that governs this API.

`MountHandle.version` is used in production by the OpenDisplay HA panel
(status line version indicator); see their [reference host adapter](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/100)
(`custom_components/opendisplay/designer/`) for a live example. First-party
HA support is tracked in [#25](https://github.com/schlomo/odl-drawcustom-designer/issues/25).

### Shadow DOM at the mount boundary ([issue #21](https://github.com/schlomo/odl-drawcustom-designer/issues/21))

`mount()` renders into an **open shadow root on the container**: it reuses `container.shadowRoot` when the host already attached one, otherwise it calls `container.attachShadow({ mode: 'open' })` itself. This isolates styles in both directions:

- The compiled stylesheet (Tailwind utilities, theme variables, editor styles) is injected as a `<style>` into the shadow root — never into the host document's `<head>`. Host CSS — including `!important` rules and colliding utility class names like `.flex` — cannot restyle the designer, and designer CSS cannot restyle the host page.
- Theme variables live on `:host` (light) and the per-instance `.dark` wrapper inside the shadow root, so `setTheme()` is scoped per mount and never touches `document.documentElement`.
- The stylesheet is injected once per shadow root and intentionally left in place on `destroy()` (a later mount into the same container reuses it).
- Designer-internal overlays (e.g. CodeMirror autocomplete/lint tooltips) render inside the shadow root, and keyboard shortcuts only react to keystrokes originating inside the instance's own shadow tree.
- Fonts still register on `document.fonts` (the FontFace API is document-wide by design); font *names* are designer-scoped enough not to collide in practice.

A host custom element (the HA panel pattern) can attach the shadow root itself and hand over its own element:

```js
class DesignerPanel extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }) // optional — mount() would create it
    this.style.display = 'block'
    this.style.height = '100%'
    this.handle = mount(this, { /* options */ })
  }
  disconnectedCallback() {
    this.handle?.destroy()
  }
}
```

The container element must support `attachShadow` (a `<div>` or an autonomous custom element does; e.g. `<span>`-like replaced elements do not).

`demo/isolation.html` is the hostile-host fixture proving the boundary: aggressive `!important` host CSS, Tailwind-colliding class names, and two instances with different themes on one page ([`tests/e2e/embed-isolation.spec.ts`](../tests/e2e/embed-isolation.spec.ts)).

### Scroll containment ([issue #79](https://github.com/schlomo/odl-drawcustom-designer/issues/79))

Designer-internal scrolling never scrolls the host page. The YAML editor scrolls itself programmatically — the Linked-editor sync centers the selected element's block on every canvas selection, and typing scrolls the cursor into view — and CodeMirror's default handling would walk ancestor scrollers past the mount boundary and call `window.scrollBy` on the host document whenever the editor's own scroller cannot absorb the full scroll. A designer embedded above other host content would visibly jump the page on every element selection or drag.

A [`scrollHandler`](../src/ui/editor/yamlScrollContainment.ts) contains all editor scroll-into-view requests to the editor's own scroller: hosts can place the designer anywhere on a scrolling page without defensive wrappers. Guarded by [`tests/e2e/embed-host-scroll.spec.ts`](../tests/e2e/embed-host-scroll.spec.ts) against the demo host page.

## Host data contract

HA-agnostic types ([`src/embed/types.ts`](../src/embed/types.ts)); an HA adapter is expected to be a thin pass-through.

### `states`

Entity-id → state value, or `{ state, attributes }`:

```js
{
  'sensor.temperature': '21.5',
  'light.desk': { state: 'on', attributes: { brightness: 128 } },
}
```

When provided, this **replaces** the State Simulator's persisted mock source for template preview (`states()`, `is_state()`, `state_attr()`, dotted access). Each push replaces the whole map. Simulator edits made inside an embedded mount stay in memory only — nothing is written to the standalone profile.

**Ownership contract (issue #110):** a pushed `states` object is treated as an **immutable snapshot** at the moment `setStates()` is called. Unchanged pushes are diffed structurally against the last-applied object and skipped for cost (no re-render, no template re-evaluation) — this compares by value, not by cloning, so **mutate-and-repush is unsupported**: if a host mutates the same object in place and calls `setStates()` again with that same reference, the mutation is invisible to the diff and the push is incorrectly treated as unchanged. Construct a fresh object (or a fresh copy of the changed parts) per push instead — the reference implementation for this contract is the OpenDisplay HA integration adapter, which already builds a new object per tick rather than mutating a cached one. In this repo, [`demo/host.js`](../demo/host.js) demonstrates the same pattern locally: a `sensor.demo_clock` state ticks every second via `setStates()`, constructing a fresh state object per push (issue #119).

### `capabilities`

Mirrors the OpenDisplay HA integration's `capabilities.py` payload:

```js
{
  pixel_width: 296, pixel_height: 128,   // physical panel, before rotation
  rotation_degrees: 0,                    // quarter turns only
  render_width: 296, render_height: 128,  // drawing surface (preferred)
  color_scheme: 0x01,                     // Basic Standard 0x00 BW … 0x04 six
  accent_color: 'red',
  available_colors: ['black', 'white', 'red'],
  color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
  palette_measured: true,
}
```

Mapping onto the canvas ([`src/embed/hostContract.ts`](../src/embed/hostContract.ts)):

- **Size** — `render_width`/`render_height` when both present, else `pixel_width`/`pixel_height` swapped for 90°/270° rotations. Either way the result is the **logical drawing surface**: the canvas the payload is authored against, which the designer then presents upright (see [Rotation](#rotation-issue-139)).
- **Rotation** — `rotation_degrees` normalized into {0, 90, 180, 270}; other angles keep the current rotation. It states the orientation of that surface; it is never applied as a transform to the design.

> **Contract: `rotation_degrees` describes the orientation `render_*` is expressed in.**
> The two are adopted as **one indivisible pair** — a display's two dimensions plus which way round they go — and every later re-orientation (the user turning the canvas, a re-lock, a re-push) turns that pair as a unit. So `rotation_degrees` must be the **effective** orientation the render dimensions are already in, not a base rotation still to be applied to them. A host that pairs a base rotation with effective-swapped dimensions is out of contract: the designer cannot detect the mismatch, and the surface reads the wrong way round as soon as the user re-orients it. When you send `pixel_*` instead, send the **physical** panel dimensions — the designer swaps them for a quarter turn itself.
- **Palette structure** — `color_scheme` (Basic Standard value) wins; else inferred from `color_map` keys / `available_colors` names; else `accent_color`.
- **Palette hexes** — the measured hex values in `color_map` re-color the active palette: preview canvas, PNG export, halftone dither tiles and the layer-list color swatches all paint the adopted hexes (one palette source of truth). Recognized names: `black`, `white`, `red`, `yellow`, `blue`, `green`; invalid hexes and unknown names are ignored. Half tones (`half_red`, `gray`, …) are re-derived as the same blends of the measured primaries. The `accent` keyword resolves through the same map, so `accent_color` participates automatically. A push without `color_map` keeps the current palette; without any push the canonical palettes apply and standalone rendering is unchanged.

**Base of the mapping — a `capabilities` push merges onto the current canvas.** It re-asserts *some* facts about the display already in effect: whatever the payload omits (a rotation it does not mention, a palette it does not measure) keeps the value the canvas has now. That is deliberate and unchanged — a host can push `{ rotation_degrees: 90 }` on its own to restate how the display it already defined is mounted. Picking a **named target** resolves the other way, from the designer's canonical defaults; the two are set side by side under [`targets`](#targets--ontargetselected-issue-106).

Known gaps: `palette_measured` itself is informational only (the hexes apply whether or not it is set). Fractional rotations are not representable. A push that carries `rotation_degrees` **without** any size fields updates the declared orientation but leaves the surface dimensions as they are — it re-declares *those* dimensions as being in the pushed orientation, so a later turn of the canvas swaps them from there. Push `render_*` (or `pixel_*`) alongside it to restate the surface, or use the [`targets`](#targets--ontargetselected-issue-106) channel, which always carries both. (This channel is removed at 2.0, [issue #121](https://github.com/schlomo/odl-drawcustom-designer/issues/121).) YAML export semantics are untouched — the payload always carries color *names*, never display hexes.

#### Rotation ([issue #139](https://github.com/schlomo/odl-drawcustom-designer/issues/139))

**The canvas is the logical drawing surface, and the designer always presents
it upright.** That is what upstream `imagegen` does: for a quarter turn it
creates the Pillow canvas *already swapped*, draws every element upright in
it, and rotates only the finished bitmap, once, at the very end. Percentage
coordinates resolve against that same logical surface. A payload is therefore
orientation-independent — the maintainer's own automation sends the identical
384×184 payload to two same-resolution panels and only the per-device
`rotate` differs (0 and 270).

Consequences for hosts:

- `render_width`/`render_height` (or the swapped `pixel_*` fallback) are the
  surface the payload is authored against — unchanged, and still exactly what
  upstream's `capabilities.py` computes.
- The **orientation control** in the designer chooses the orientation of that
  surface: a quarter turn swaps its W/H. It never turns the editing surface,
  the elements, or the exported image. It is also the **only** control that
  does — the resolution quick-picks name a display by its *pair* of dimensions
  and are orientation-insensitive: a 128×296 canvas still reads as the
  `296×128` pick, and choosing a pick lands it in the orientation currently
  held.
- **The canvas rotation is absolute, never cumulative.** It *is* the
  orientation: seeded from the host, changed by the user, replaced outright by
  the next thing that sets it. Nothing anywhere sums it with a base rotation.
- **PNG export / Copy PNG is the upright logical canvas** — the bitmap before
  HA's own `rotate`. Do not re-rotate it before sending; HA (and, for
  OpenDisplay, the firmware) applies the panel's rotation itself.
- `rotate` is **not emitted** in the payload today. The send-time value is
  per-target output metadata and will travel through the service options seam
  ([issue #105](https://github.com/schlomo/odl-drawcustom-designer/issues/105)),
  never baked into the design: that seam sends the canvas rotation **as-is**
  (or a value the host computes for that target from it), never the canvas
  rotation added to something else.
- **Changing the orientation is not undoable** — like every other display-config
  change (resolution, color mode, dither), it sits outside the payload's undo
  history. Pre-existing behavior, unchanged here.
- **Sessions and share links authored before this model reopen upright.**
  Element coordinates always were logical — the old model only turned the
  presentation — so nothing needs migrating: a design saved at 90° reopens as
  the same design on a surface of the same two dimensions.

#### Display config lock ([issue #70](https://github.com/schlomo/odl-drawcustom-designer/issues/70))

When the mount received `capabilities` — at `mount()` or via `setCapabilities()` — the display config is **host-owned**: a lock icon appears next to the "Display config" heading, and the resolution and color mode controls follow its state.

**Lock scope excludes rotation** (maintainer ruling 2026-08-16, amending the original issue #70 shape): the lock covers **dimensions and color mode/palette only**. Rotation is a user choice — how the same physical display is mounted (portrait vs. landscape) — so the orientation buttons stay **enabled whether or not the display config is locked**, and changing the orientation never unlocks the display or clears a target selection. What it *does* change is the orientation of the logical drawing surface, so the W/H the lock shows swap with it (issue #139): the lock still owns the display's two dimensions, the user still owns which way round they go. Re-locking restores the host's panel in the orientation the user is holding.

- **Locked (default)** — the resolution and color-mode controls are disabled; rotation stays enabled. Both `mount({ capabilities })` and `handle.setCapabilities(capabilities)` lock **by default** (`lock` defaults to `true`), so existing hosts that never pass `lock` see unchanged behavior for those two controls.
- **Unlock (`lock: false`, or clicking the lock)** — the "virtual display" escape hatch: the user may configure any resolution/color mode immediately (rotation was already theirs), and the preview no longer matches the host's physical display's dimensions/palette. Pass `lock: false` to `mount()` or `setCapabilities(capabilities, { lock: false })` to *seed* a display this way — e.g. a host that wants to hand the user a starting point without pinning them to it. The pushed values still land on the canvas and the lock icon still appears (showing its unlocked state) so the user can lock onto them later.
- **Re-lock** (click the lock, whether it was unlocked by the user or seeded via `lock: false`) — restores the last-pushed host dimensions/color mode/palette (the designer-only preview dither setting survives too), **oriented to the rotation currently in effect**. **Rotation is left exactly as it currently is** — it was never lock-owned, so re-locking never snaps it back to whatever the host declared.
- **A new `setCapabilities()` push** re-asserts the host display and, by default, re-locks the controls; pass `{ lock: false }` to keep them unlocked instead. Rotation follows the anonymous-channel rule below.
- **Load Demo while locked** loads the demo payload and simulator seed but **keeps** the host-defined resolution/palette (and the rotation currently in effect, whatever the user set it to). Accepted consequence: on small displays the demo layout may look bad. Unlocked (including the `lock: false` seed), Load Demo applies the showcase display config as in standalone.
- **No `capabilities`** (standalone, or an embed that never pushes them): no lock icon, controls behave exactly as before.
- **With [`targets`](#targets--ontargetselected-issue-106)** the same lock serves the display picker: selecting a display locks onto it, "Virtual display" is the unlocked state, and re-locking returns to the selected display's dimensions/palette. Nothing about the lock itself changes — and the rotation carve-out above applies identically, with its own re-apply rule spelled out below.

### `targets` / `onTargetSelected` ([issue #106](https://github.com/schlomo/odl-drawcustom-designer/issues/106))

The host pushes the **displays it knows about**; the designer renders a picker
inside its own display-config area, right above the resolution control
([ADR-018](adr/ADR-018-host-ui-seam.md) targets seam). No host-built display
picker outside the mount — that was the drift ADR-018 exists to end.

```js
const targets = [
  {
    id: 'display.kitchen',              // opaque, host-defined; echoed back untouched
    label: 'Kitchen tag (296×128 BWR)', // picker entry text
    capabilities: { render_width: 296, render_height: 128, color_scheme: 0x01 },
  },
  { id: 'display.office', label: 'Office display', capabilities: { /* … */ } },
]

const handle = mount(el, {
  capabilities: CURRENT_DISPLAY,   // optional: the display to start on (see precedence)
  targets,
  onTargetSelected(targetId) {
    // targetId === null: the user switched to the virtual display
    handle.setActions(actions(targetId))   // e.g. disable Send without a display
  },
  onAction(id, payload, { targetId }) {
    if (id === 'send') void sendToDisplay(targetId, payload)
  },
})

// Re-push whenever your display inventory changes — this is the normal way to work:
handle.setTargets([...targets, discoveredDisplay])   // appears in the picker, no reload
```

- **`capabilities` is the same shape** as the [`capabilities`](#capabilities)
  channel and maps onto the canvas through exactly the same code — one display
  pipeline, not two. Field values are equally tolerant: a rotation that is not
  a quarter turn or a zero size is ignored by the mapping rather than rejected
  at the push.
- **Selecting a target adopts its capabilities and locks** the display config,
  reusing the [display config lock](#display-config-lock-issue-70) UX
  unchanged: the lock icon appears, the resolution / rotation / color-mode
  controls follow it, and re-locking restores the **selected target's** values.
- **A pick resolves from the designer's canonical defaults, not from the canvas
  in front of the user.** Picking a display *is* that display, so the same
  target always produces the same canvas, whatever was picked before it. What a
  target does not declare comes from the defaults (no rotation, canonical
  palette) — never from the display previously in effect. The two display
  channels therefore differ in exactly one way, deliberately:

  | | base of the mapping | why |
  |---|---|---|
  | `capabilities` push (anonymous display) | **merges onto the current canvas** — omitted fields keep their current value | a partial push re-asserts *some* facts about the display already in effect (`{ rotation_degrees: 90 }` re-declares its orientation) |
  | `targets` pick (named display) | **canonical designer defaults** — omitted fields fall back to those | picking names a *different* display; inheriting the previous one's rotation or measured `color_map` would paint one panel's red on another's tag (ADR-007 parity) |

  Everything else — the mapping itself, the lock UX, the tolerance for junk
  values — is shared code. The designer-only preview dither mode survives both,
  like it survives the lock.
- **Re-pushing the selected target's capabilities re-applies them.** If a
  `setTargets()` push carries *different* capabilities for the display the
  design is currently pinned to, the host has re-defined that display — the same
  re-assert principle a `setCapabilities()` push carries — so the canvas follows
  it (canonical base, as above) and stays locked. Unlocked, the user owns the
  canvas: the new values are stored, and re-locking applies them. A push that
  only *relabels* the target moves nothing. **Rotation is the one field this
  re-apply does not always follow** (lock scope, maintainer ruling
  2026-08-16): if the user changed rotation since picking this target, that
  rotation survives the re-apply; only a rotation left untouched since the
  pick adopts what the target now declares. Picking the target (again, or for
  the first time) always resets this — the freshly-picked rotation is the new
  baseline "since the pick" measures from.
- **"Virtual display" is the picker's name for unlocked.** Picking it is
  identical to clicking the lock open: the controls become editable and the
  design is no longer pinned to real hardware. The selection is *remembered*
  while unlocked — re-locking (or picking the target again) returns to it — so
  the picker reads "Virtual display" whenever the config is unlocked, and the
  target again once it is not.
- **Precedence between `capabilities` and `targets`** (the two display channels
  coexist until 2.0, [issue #121](https://github.com/schlomo/odl-drawcustom-designer/issues/121)):
  a bare `capabilities` push is an **anonymous target** — a real display that
  carries no id — and behaves exactly as it always has: it adopts the values
  and locks (or seeds unlocked with `lock: false`). The picker then shows
  "Host display". Pushing `targets` only says what the user *can* pick; it
  never moves the canvas by itself, and nothing is auto-selected (a
  single-display host still seeds with `capabilities`; auto-selection arrives
  when the targets seam subsumes that channel at 2.0). An explicit pick is the
  only thing that selects a named target, and it wins over the anonymous
  display; a later `capabilities` push wins back, clearing the named
  selection. Last write wins — the channels never merge.
- **Re-pushable, and diffed.** Push the *whole* list again whenever your
  inventory changes; the designer compares it structurally and does nothing at
  all when it is unchanged, so a host may re-push on a timer. Pushed targets
  are copied and frozen on the way in (like [`actions`](#actions--onaction-issue-108),
  unlike [`states`](#states)), so mutate-and-repush works.
- **Removing the selected display keeps it** ("keep and mark stale"): the
  designer holds that display's last-known capabilities and lock state, marks
  the selection *unavailable* in the picker and says so in a visible hint. It
  never silently switches to another display and never unlocks — a design in
  progress does not silently start describing different hardware. Pushing the
  display back clears the marker; the remaining displays stay one pick away.
  The marker applies exactly while the missing display is the one in effect:
  unlocking to the virtual display puts the design on nothing in particular, so
  the picker just offers what you still have — until it is re-locked (which
  returns to the missing display's last-known values).
- **A stale selection reports no target id.** The designer never hands you back
  an id that is absent from your own current list: the moment a push drops the
  selected display, `onTargetSelected(null)` fires once and `onAction`'s
  `context.targetId` is `undefined` — including after unlocking and re-locking
  onto it. What stays on screen is the *label*, marked unavailable; that is for
  the user, so they can see what the design is still shaped for. Pushing the
  display back reports its id again.
- **`onTargetSelected` is optional** and fires only on change: a target id, or
  `null` for the virtual display (including when the user clicks the lock open,
  and when the selected display leaves your list). It is the channel to react to
  a selection — re-pushing `actions` with a
  `disabledReason: 'No display selected'`, for instance. A host that only
  needs the id when something happens can skip it and read
  `onAction`'s `context.targetId`, which carries the same value (`undefined`
  where this callback reports `null`). Like every other function on the mount
  options it is fixed at mount — ADR-018 pushes data, never functions.
- **Do not push bare `capabilities` in reaction to a selection.** Calling
  `setCapabilities()` from inside `onTargetSelected` un-picks the selection the
  user just made: that push is the *anonymous* display, and last write wins, so
  the picker drops back to "Host display" (it does not loop — the designer
  reports nothing for the anonymous display — but the pick is gone). A
  targets-using host reacts to a selection with `setActions()` /
  `setTargets()` / its own service calls, and leaves the display channel to the
  user's pick.
- **Malformed lists throw** at the push that carries them (missing or
  duplicate `id`, missing `label`, missing `capabilities`) and leave the
  designer untouched; a bad list passed to `mount()` throws before the
  container is touched. `id` and `label` are trimmed, so incidental padding
  never reaches the picker or the id echoed back.
- **No targets, no picker.** A designer that is pushed no targets renders
  exactly the display-config area it did before, standalone included. Once a
  display has been picked the picker stays — an emptied list leaves the "Virtual
  display" entry standing, because that control is how the user leaves the
  display they are on.

The demo host page pushes three displays, adds a fourth on demand, and removes
the selected one to demonstrate the stale state ([`demo/host.js`](../demo/host.js),
guarded by [`tests/e2e/embed-targets.spec.ts`](../tests/e2e/embed-targets.spec.ts)).

### `actions` / `onAction` ([issue #108](https://github.com/schlomo/odl-drawcustom-designer/issues/108))

The host registers a **typed, closed list of buttons**; the designer renders
them in its own toolbar and reports back which one fired, with the current
payload ([ADR-018](adr/ADR-018-host-ui-seam.md) actions seam). Meaning, auth
and the actual service call stay entirely host-side — this is deliberately
*not* a plugin API, and no host markup ever enters the designer's shadow root.

```js
const actions = (displayOnline) => [
  {
    id: 'send',                    // opaque, host-defined; echoed back to onAction
    label: 'Send to display',      // button text and accessible name
    icon: 'send',                  // optional Material Design Icon name
    severity: 'caution',           // 'normal' (default) | 'caution' | 'danger'
    disabledReason: displayOnline ? undefined : 'Display offline — reconnect to send',
  },
  { id: 'validate', label: 'Validate', icon: 'check' },
  // Host-side UI that never reads the design — stays clickable even while
  // the YAML editor is blocked.
  { id: 'settings', label: 'Display settings', icon: 'monitor-dashboard', needsPayload: false },
]

const handle = mount(el, {
  actions: actions(true),
  onAction(id, payload, context) {
    // payload === handle.getPayload() at this instant; context.targetId is the
    // selected display (see `targets` above), undefined when there is none.
    if (id === 'send') void sendToDisplay(context.targetId, payload)
  },
})

// Re-push whenever host state changes — this is the normal way to work:
handle.setActions(actions(false))   // Send is now disabled, with its reason
handle.setActions([])               // no action buttons at all
```

- **Mount option ≡ initial push.** `mount(el, { actions })` is exactly
  `mount(el)` + `setActions(actions)` applied before the first painted frame,
  and everything pushed at mount is re-pushable afterwards. `onAction` itself
  is a stable closure — there is no update channel for functions.
- **`onAction` is required** whenever actions are registered. Because it is
  fixed at mount, a mount without one can never take an action — so a
  non-empty list at `mount()` *or* at `setActions()` throws instead of
  painting buttons that look live and do nothing. `setActions([])` stays
  legal either way.
- **Re-pushable, and diffed.** Push the *whole* list again on every host state
  change; the designer compares it structurally and does nothing at all when
  it is unchanged, so a host may re-push on a timer. Unlike
  [`states`](#states), the pushed actions are copied on the way in, so
  mutate-and-repush works too.
- **Severity is presentation only:** `normal` regular chrome, `caution`
  orange, `danger` red — in both themes. `caution` is the reference case for
  an action that reaches beyond the designer (the OpenDisplay integration's
  Send-to-display drives physical hardware). The designer never infers
  behavior from it: no confirmation dialog, no interception.
- **`disabledReason` disables the button** and is what the user reads when
  hovering it — the field hosts flip live ("Display offline", "No target
  selected"). Clearing it re-enables the button. It is also exposed to
  assistive tech as the button's description, so it is readable without
  hovering; the button keeps its own surface under the pointer while
  disabled, and toggling the reason never remounts it (focus survives).
- **`icon` is any [Material Design Icon](https://pictogrammer.com/library/mdi/)
  name**, resolved exactly as a payload `icon` element resolves it — the
  `mdi:` prefix is optional, so `send`, `mdi:send` and `home-assistant` all
  work. One icon vocabulary, not two: the designer already bundles the full
  MDI set deliberately for the payload's icon element, so every name that
  element accepts is available here at no added bundle size and with no icon
  dependency on the host side.
- **`needsPayload` (default `true`)** says whether the action reads the
  design. See the blocked-editor rule below; set `false` for host-side UI
  that does not need the payload at all.
- **Malformed lists throw** at the push that carries them (unknown `icon` or
  `severity`, non-boolean `needsPayload`, missing or duplicate `id`, missing
  `label`), like invalid `payload` YAML does, and leave the designer
  untouched. A bad list passed to `mount()` throws before the container is
  touched. Text fields are trimmed, so incidental padding never reaches the
  button or the id echoed back to `onAction`.
- **While the YAML editor is blocked** by a parse/schema error, every action
  that needs the payload is disabled — same rule as Save — and says so on
  hover. A host `disabledReason` takes precedence over that message.
  A `needsPayload: false` action stays clickable and receives the **last
  valid payload**, exactly what [`getPayload()`](#getpayload-issue-104)
  reports while blocked.
- The designer's built-in **Save button is the same species of control** and
  becomes an ordinary action instance at 2.0, when `onSaveRequest` and the
  built-in button are removed ([issue #121](https://github.com/schlomo/odl-drawcustom-designer/issues/121)).

The demo host page registers all three example actions and a "Simulate display
offline" toggle that re-pushes the list ([`demo/host.js`](../demo/host.js),
guarded by [`tests/e2e/embed-actions.spec.ts`](../tests/e2e/embed-actions.spec.ts)).

### `payload` / `onSaveRequest`

The payload is the drawcustom **element list YAML** (what the YAML panel shows). The parent owns persistence: session autosave is disabled in embedded mode, the share-link button is hidden, and `onSaveRequest(payload)` fires only on an explicit Save click.

### `theme`

`'light' | 'dark'`, applied as a class on the designer's wrapper element inside the mount's shadow root — embedded mounts never touch `document.documentElement` or `localStorage` theme preferences. Because every instance carries its own wrapper and stylesheet, two mounts on one page can hold different themes simultaneously.

## Clipboard requires a secure context

The copy buttons (Copy PNG, Copy YAML, share link) use the async clipboard
API, which browsers only expose in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
— HTTPS or `http://localhost`. When the host page is served from a plain-http
LAN IP or `file://` — the typical local Home Assistant box
(`http://192.168.1.2:8123`, `http://homeassistant.local:8123`), so the common
case rather than an edge case:

- **Copy YAML** and the share link still work — the designer falls back to the
  legacy `document.execCommand('copy')` path for text. They carry no warning.
- **Copy PNG** has no insecure-context clipboard path, and signals that
  upfront: the button renders warning-marked (amber surface plus a corner
  badge) from first paint, and hovering or focusing it shows
  "Copy PNG needs HTTPS or localhost — use Download PNG instead". It stays
  clickable; a click still fails with the visible "Clipboard requires HTTPS
  or localhost" alert as backstop. Use Download PNG, or serve the host page
  over HTTPS/localhost to get Copy PNG back.

## Standalone SPA

The standalone GitHub Pages app is a **host adapter over the same mount lifecycle** the library exports ([issue #72](https://github.com/schlomo/odl-drawcustom-designer/issues/72), [ADR-017](adr/ADR-017-host-adapter-seam.md)): [`src/main.tsx`](../src/main.tsx) calls `mountStandaloneApp()` ([`src/embed/standalone.tsx`](../src/embed/standalone.tsx)), which mounts `createStandaloneHost()` ([`src/embed/standaloneHost.ts`](../src/embed/standaloneHost.ts)) through the internal `mountDesigner()` in [`src/embed/mount.tsx`](../src/embed/mount.tsx) — the same function the public `mount()` uses with the embedded adapter.

Standalone behavior is unchanged by embedding: page-DOM rendering (no shadow root), document-level theme, IndexedDB session/mocks/variables autosave, `#d=` share-hash bootstrap and same-tab re-bootstrap, share link and theme toggle in the chrome.

### Host adapters

Everything that used to be an `embedded` conditional in the React shell is policy on the `DesignerHost` adapter ([`src/embed/host.ts`](../src/embed/host.ts)):

| Policy | Standalone | Embedded (`mount()`) |
|--------|-----------|----------------------|
| `styleScope` | `page` (page's own stylesheet) | `shadow` (isolated root + injected CSS) |
| `theme` | `{ owner: 'designer' }` — persisted preference on `document.documentElement`, theme toggle shown | `{ owner: 'host', value }` — fixed, scoped to the mount wrapper |
| `fill` | `viewport` | `container` |
| `shareLink` | `true` | `false` |
| `persistence` | IndexedDB writers | `null` — the parent owns the payload |
| `onSaveRequest` | absent (persists continuously) | present → Save button |
| `actions` / `onAction` | absent — no action chrome | host-registered buttons (issue #108) |
| `targets` / `onTargetSelected` | absent — no display picker | host-pushed displays in the picker (issue #106) |
| `loadBootstrap` | async: session + `#d=` hash | sync: `payload`/`states`/`capabilities` options |

The interface is **internal on purpose** — it references internal types, so publishing it would freeze designer internals under semver ([`docs/releasing.md`](releasing.md)). The public embedded surface (`mount`, `MountOptions`, `MountHandle`, the host data contract) is unchanged by the convergence. The M4 HA panel ([issue #25](https://github.com/schlomo/odl-drawcustom-designer/issues/25)) becomes a third adapter, not a third mode.
