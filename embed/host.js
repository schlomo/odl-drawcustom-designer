// Fake host page for the embeddable designer (issue #20). Loads the library
// build from the same directory (see vite.lib.config.ts publicDir wiring),
// mounts the designer, pushes fake states and display targets, and handles the
// Save and Send actions it registers — the same integration surface a real host
// (e.g. the OpenDisplay HA integration panel) uses. Serve with:
//   npm run build:lib && python3 -m http.server -d dist-lib
//
// Also pushes a self-mutating `sensor.demo_clock` state once per second
// (issue #119, ADR-018) — the living example of the `setStates()` push
// channel, not just a one-time seed. The friendly_name row's template
// concatenates it onto the existing element so the demo payload keeps its
// element count (3) that other e2e specs assert against; see
// tests/e2e/embed-host-live-ticker.spec.ts for the ticking proof.
//
// Because this host feeds states, the designer's State Simulator is off and its
// tab is the read-only States panel instead (issue #107, ADR-018): every state
// below carries a friendly `name` the panel shows, and Load Demo here loads the
// demo *payload only* — the demo's own states are Simulator data, so they show
// honestly as "not supplied" in the panel.
import { mount } from './odl-drawcustom-designer.js'

const PAYLOAD = `- type: text
  value: "{{ states('sensor.demo_temperature') }} °C"
  x: 10
  y: 10
  size: 24
- type: text
  value: "{{ state_attr('sensor.demo_temperature', 'friendly_name') }} · {{ states('sensor.demo_clock') }}"
  x: 10
  y: 44
  size: 16
- type: rectangle
  x_start: 4
  y_start: 4
  x_end: 200
  y_end: 70
  outline: red
  width: 2
`

// `name` is the state's friendly name (issue #107, ADR-018 state catalog): the
// label the designer's read-only States panel shows instead of the raw key. It
// is presentation only — templates still read `states()`/`state_attr()`, so the
// payload above is unaffected — and re-pushable like every other field.
const WARM_STATES = {
  'sensor.demo_temperature': {
    state: '21.5',
    name: 'Living-room temperature',
    attributes: { friendly_name: 'Living room', unit_of_measurement: '°C' },
  },
}

const COLD_STATES = {
  'sensor.demo_temperature': {
    state: '3.2',
    name: 'Balcony temperature',
    attributes: { friendly_name: 'Balcony', unit_of_measurement: '°C' },
  },
}

// A state this host knows about but the demo payload never references — proof
// the States panel lists only what the design reads, while autocomplete still
// offers the whole catalog.
const UNREFERENCED_STATES = {
  'binary_sensor.demo_door': { state: 'off', name: 'Front door' },
}

// Ownership contract (docs/embedding.md#states — issue #110): a pushed
// `states` object is an immutable snapshot, diffed by value against the
// last-applied push. Mutate-and-repush is invisible to that diff, so this
// constructs a fresh object every tick instead of mutating a cached one.
function currentClockState() {
  const time = new Date().toTimeString().slice(0, 8) // "HH:MM:SS"
  return {
    'sensor.demo_clock': {
      state: time,
      name: 'Demo clock',
      attributes: { friendly_name: 'Demo clock' },
    },
  }
}

// Measured panel palette (issue #68): the red hex is deliberately NOT the
// canonical #ff0000 — the designer preview must visibly adopt it.
const CAPABILITIES_296X128_BWR = {
  pixel_width: 296,
  pixel_height: 128,
  rotation_degrees: 0,
  render_width: 296,
  render_height: 128,
  color_scheme: 0x01,
  accent_color: 'red',
  available_colors: ['black', 'white', 'red'],
  color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
  palette_measured: true,
}

// Display targets (issue #106, ADR-018): the displays this fake host "knows
// about" — the designer's only display channel (issue #121). Ids are opaque to
// the designer: it echoes them back through `onTargetSelected` and `onAction`'s
// context and never interprets them. Picking one resizes and re-palettes the
// canvas; a host with exactly one display pushes a one-element list, which the
// designer adopts and locks without a pick.
const CAPABILITIES_400X300_BW = {
  render_width: 400,
  render_height: 300,
  color_scheme: 0x00,
  available_colors: ['black', 'white'],
}

const CAPABILITIES_800X480_BWRY = {
  render_width: 800,
  render_height: 480,
  color_scheme: 0x03,
  available_colors: ['black', 'white', 'red', 'yellow'],
}

const CAPABILITIES_800X480_BWRY_PORTRAIT = {
  render_width: 480,
  render_height: 800,
  rotation_degrees: 90,
  color_scheme: 0x03,
  available_colors: ['black', 'white', 'red', 'yellow'],
}

const CAPABILITIES_152X152_BW = {
  pixel_width: 152,
  pixel_height: 152,
  color_scheme: 0x00,
}

const KITCHEN_TARGET = {
  id: 'display.kitchen',
  label: 'Kitchen tag (296×128 BWR)',
  capabilities: CAPABILITIES_296X128_BWR,
}

// The full inventory a multi-display host offers. This page starts as the
// single-display host instead (see the mount below) — the reference shape, and
// the one that shows the auto-adopt rule — and pushes this list on demand.
const ALL_TARGETS = [
  KITCHEN_TARGET,
  { id: 'display.office', label: 'Office display (400×300 BW)', capabilities: CAPABILITIES_400X300_BW },
  { id: 'display.hallway', label: 'Hallway 7.5" (800×480 BWRY, portrait)', capabilities: CAPABILITIES_800X480_BWRY_PORTRAIT },
]

// The display this host "discovers" later — the hot-update demo.
const LATE_TARGET = {
  id: 'display.garage',
  label: 'Garage tag (152×152 BW)',
  capabilities: CAPABILITIES_152X152_BW,
}

const savedPayload = document.getElementById('saved-payload')
const actionLog = document.getElementById('action-log')
const targetLog = document.getElementById('target-log')

// Host-registered actions (issue #108, ADR-018): the host owns what each button
// means — this page fakes persistence, a display transmission and a payload
// check. Save is one of them and nothing special (issue #121): the designer has
// no save channel of its own, so a host that wants a Save button registers one.
// `severity: 'caution'` is the reference case: Send drives real hardware.
// `icon` takes any Material Design Icon name — the same vocabulary a payload
// icon element accepts, so `monitor-dashboard` needs no special casing.
function buildActions(displayOnline) {
  return [
    { id: 'save', label: 'Save' },
    {
      id: 'send',
      label: 'Send to display',
      icon: 'send',
      severity: 'caution',
      disabledReason: displayOnline ? undefined : 'Display offline — reconnect to send',
    },
    { id: 'validate', label: 'Validate', icon: 'check' },
    // Host-side UI that never reads the design: `needsPayload: false` keeps
    // it clickable even while the YAML editor is blocked by a syntax error.
    { id: 'settings', label: 'Display settings', icon: 'monitor-dashboard', needsPayload: false },
  ]
}

let displayOnline = true

// The temperature reading the ticker's next tick should keep pushing
// alongside the clock — updated by the warm/cold buttons below so a push
// mid-tick never clobbers the other's latest value (setStates() replaces
// the whole map, so every push must carry both).
let temperatureStates = WARM_STATES

function pushCombinedStates() {
  handle.setStates({ ...temperatureStates, ...UNREFERENCED_STATES, ...currentClockState() })
}

// Single source of truth for "current non-clock states" (Copilot review on
// PR #128): every push driving this page — the warm/cold buttons below, or
// an e2e fixture standing in for a host push mid-drag — must go through
// here so it lands in `temperatureStates`. A push made any other way (e.g.
// straight through `designerHandle.setStates()`) is invisible to the
// ticker: the next 1s tick would re-push the stale `temperatureStates`
// snapshot from mount and silently clobber it. Routing every push through
// this updater means the ticker's next re-push always carries forward
// whatever was last set, by construction. Exposed on `window` for the e2e
// suite (tests/e2e/embed-host-push-mid-drag.spec.ts,
// tests/e2e/embed-host-live-ticker.spec.ts) and console experiments.
function demoPushStates(states) {
  temperatureStates = states
  pushCombinedStates()
}
window.demoPushStates = demoPushStates

// Which host shape this page mounts as — the two halves of the auto-adopt rule
// (issue #121), same page and same handlers either way:
//
//   /            one display   -> the designer adopts and locks it, no pick
//   /?displays=all  three      -> a choice; the designer resolves nothing
//
// The default is the reference shape (a single-display host, e.g. a display's
// own details page); `?displays=all` is the multi-display host, and is what the
// e2e suite loads to see the picker on its very first paint.
const mountsWholeInventory = new URLSearchParams(location.search).get('displays') === 'all'

// The host's own view of the display inventory and of what the user picked in
// the designer's picker — kept in sync through `onTargetSelected` below, which
// is the only way this page learns about a selection before an action fires.
let targets = mountsWholeInventory ? ALL_TARGETS : [KITCHEN_TARGET]
let selectedTargetId = null

const handle = mount(document.getElementById('designer'), {
  payload: PAYLOAD,
  states: { ...WARM_STATES, ...UNREFERENCED_STATES, ...currentClockState() },
  theme: 'light',
  // One display = "this is the display" (issue #121): the designer adopts and
  // locks onto it without a pick, so the first painted frame is already this
  // 296×128 BWR panel with its measured palette. Push "Push display list" (or
  // load `?displays=all`) to be a multi-display host and get the picker's
  // choices instead — several displays are a choice and adopt nothing.
  targets,
  onTargetSelected(targetId) {
    // `null` = the user switched to the virtual display (or unlocked the
    // display config), so the design is no longer pinned to real hardware.
    selectedTargetId = targetId
    targetLog.textContent =
      targetId === null
        ? 'Virtual display — no target selected'
        : `Selected display: ${targetId}`
  },
  actions: buildActions(displayOnline),
  onAction(id, payload, context) {
    // The designer reports only which button fired, the current payload and
    // the opaque id of the display it is pinned to; everything below is
    // host-side meaning.
    if (id === 'save') {
      // What `onSaveRequest` used to be (issue #121): a host action like any
      // other, with the payload the designer would hand `getPayload()`.
      savedPayload.textContent = payload
      return
    }
    if (id === 'send') {
      const to = context.targetId ?? 'the virtual display (no target selected)'
      actionLog.textContent = `Sent ${payload.length} bytes to ${to}:\n${payload}`
      return
    }
    if (id === 'validate') {
      const elementCount = payload.split(/^- /m).length - 1
      actionLog.textContent = `Validated ${elementCount} element(s).`
      return
    }
    if (id === 'settings') {
      actionLog.textContent = 'Opened the host-side display settings (no payload needed).'
      return
    }
    actionLog.textContent = `Unhandled action: ${id}`
  },
})

// Expose for the Playwright e2e suite and for console experiments.
window.designerHandle = handle

// Ticker (issue #119): proves the live-update push channel end to end,
// not just a one-time seed. Starts right after mount (the initial states
// option above already covers the first frame); cleaned up on Destroy so a
// destroyed handle never gets an interval calling setStates() on it.
const tickerIntervalId = setInterval(pushCombinedStates, 1000)

document.getElementById('push-warm').addEventListener('click', () => {
  demoPushStates(WARM_STATES)
})
document.getElementById('push-cold').addEventListener('click', () => {
  demoPushStates(COLD_STATES)
})
// Targets are the one display channel (issue #121): this is the same host
// growing from "one display" to "an inventory the user picks from". The display
// already adopted stays adopted — a push only ever *offers* displays once the
// designer is pinned to one.
document.getElementById('push-display-list').addEventListener('click', () => {
  targets = ALL_TARGETS
  handle.setTargets(targets)
  targetLog.textContent = `Pushed ${targets.length} displays — pick one in the designer`
})
// Actions are re-pushable (ADR-018): the whole list goes back whenever host
// state changes, and the designer diffs it — here a fake connection drop
// disables Send with a reason, live.
document.getElementById('toggle-connection').addEventListener('click', (event) => {
  displayOnline = !displayOnline
  handle.setActions(buildActions(displayOnline))
  event.target.textContent = displayOnline ? 'Simulate display offline' : 'Simulate display online'
})
// Targets are hot-updateable (ADR-018): a display the host learns about later
// appears in the picker without a reload.
document.getElementById('add-display').addEventListener('click', () => {
  if (targets.some((target) => target.id === LATE_TARGET.id)) {
    targetLog.textContent = `${LATE_TARGET.label} is already in the list`
    return
  }
  targets = [...targets, LATE_TARGET]
  handle.setTargets(targets)
  targetLog.textContent = `Added ${LATE_TARGET.label} — it is in the picker now`
})
// Keep-and-mark-stale: removing the *selected* display must not switch the
// designer to another one or unlock it — it keeps the last-known display config
// and marks the selection unavailable.
document.getElementById('remove-selected-display').addEventListener('click', () => {
  if (selectedTargetId === null) {
    targetLog.textContent = 'Pick a display in the designer first'
    return
  }
  targets = targets.filter((target) => target.id !== selectedTargetId)
  handle.setTargets(targets)
  targetLog.textContent = `Removed ${selectedTargetId} — the designer keeps its last-known display config`
})
document.getElementById('theme').addEventListener('change', (event) => {
  handle.setTheme(event.target.value)
})
document.getElementById('destroy').addEventListener('click', () => {
  // Order matters: clearInterval() runs synchronously before destroy(), so
  // no queued tick can ever fire pushCombinedStates() -> handle.setStates()
  // against an already-destroyed handle (which throws — see mount.tsx).
  clearInterval(tickerIntervalId)
  handle.destroy()
})
