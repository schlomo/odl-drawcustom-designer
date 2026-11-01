// Hostile-host isolation fixture (issue #21): two designer instances with
// different themes on one aggressively styled page. Exercised by
// tests/e2e/embed-isolation.spec.ts; see isolation.html for the host CSS.
import { mount } from './odl-drawcustom-designer.js'

const PAYLOAD = `- type: text
  value: "{{ states('sensor.demo_temperature') }} °C"
  x: 10
  y: 10
  size: 24
`

const STATES = { 'sensor.demo_temperature': '21.5' }

window.designerHandles = {
  light: mount(document.getElementById('designer-light'), {
    payload: PAYLOAD,
    states: STATES,
    theme: 'light',
  }),
  dark: mount(document.getElementById('designer-dark'), {
    payload: PAYLOAD,
    states: STATES,
    theme: 'dark',
  }),
}
