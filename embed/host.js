// Fake host page for the embeddable designer (issue #20). Loads the library
// build from the same directory (see vite.lib.config.ts publicDir wiring),
// mounts the designer, pushes fake states/capabilities and receives Save
// requests — the same integration surface a real host (e.g. the OpenDisplay
// HA integration panel) uses. Serve with:
//   npm run build:lib && python3 -m http.server -d dist-lib
import { mount } from './odl-drawcustom-designer.js'

const PAYLOAD = `- type: text
  value: "{{ states('sensor.demo_temperature') }} °C"
  x: 10
  y: 10
  size: 24
- type: text
  value: "{{ state_attr('sensor.demo_temperature', 'friendly_name') }}"
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

const WARM_STATES = {
  'sensor.demo_temperature': {
    state: '21.5',
    attributes: { friendly_name: 'Living room', unit_of_measurement: '°C' },
  },
}

const COLD_STATES = {
  'sensor.demo_temperature': {
    state: '3.2',
    attributes: { friendly_name: 'Balcony', unit_of_measurement: '°C' },
  },
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

const savedPayload = document.getElementById('saved-payload')

const handle = mount(document.getElementById('designer'), {
  payload: PAYLOAD,
  states: WARM_STATES,
  capabilities: CAPABILITIES_296X128_BWR,
  theme: 'light',
  onSaveRequest(payload) {
    savedPayload.textContent = payload
  },
})

// Expose for the Playwright e2e suite and for console experiments.
window.designerHandle = handle

document.getElementById('push-warm').addEventListener('click', () => {
  handle.setStates(WARM_STATES)
})
document.getElementById('push-cold').addEventListener('click', () => {
  handle.setStates(COLD_STATES)
})
document.getElementById('push-capabilities').addEventListener('click', () => {
  handle.setCapabilities(CAPABILITIES_296X128_BWR)
})
document.getElementById('theme').addEventListener('change', (event) => {
  handle.setTheme(event.target.value)
})
document.getElementById('destroy').addEventListener('click', () => {
  handle.destroy()
})
