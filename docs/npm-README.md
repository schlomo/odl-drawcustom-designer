# @schlomo/odl-drawcustom-designer

Embeddable visual editor for **OpenDisplay Language (ODL) / OpenEPaperLink**
`drawcustom` YAML — design e-paper display layouts for Home Assistant,
in the browser.

[![npm version](https://img.shields.io/npm/v/@schlomo/odl-drawcustom-designer)](https://www.npmjs.com/package/@schlomo/odl-drawcustom-designer)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/schlomo/odl-drawcustom-designer/blob/main/LICENSE)

## Install

```bash
npm install @schlomo/odl-drawcustom-designer
```

Ships as **one self-contained ESM file** — React and every other runtime
dependency bundled in, no peer dependencies to resolve.

## Usage

```js
import { mount } from '@schlomo/odl-drawcustom-designer'

const handle = mount(document.getElementById('designer'), {
  payload: yamlString,          // initial drawcustom YAML (list of elements)
  states: { /* entity states, for template preview */ },
  capabilities: { /* display description -> canvas + palette */ },
  theme: 'dark',                // 'light' | 'dark', scoped to the container
  onSaveRequest(payload) {
    // user hit Save — persist the YAML; the designer never writes it itself
  },
})
```

The container needs an explicit height; the designer fills it. Styles and
DOM are isolated in a shadow root at the mount boundary — host CSS never
leaks in, and the designer never touches the host document. Full mount API,
host data contract (`states`/`capabilities`/`theme`), and options: see the
embedding docs linked below.

## Links

- Live demo: https://schlomo.github.io/odl-drawcustom-designer/embed/
- Embedding docs: https://github.com/schlomo/odl-drawcustom-designer/blob/main/docs/embedding.md
- Source & issues: https://github.com/schlomo/odl-drawcustom-designer
- Releases: https://github.com/schlomo/odl-drawcustom-designer/releases

## License

Apache-2.0 — see [LICENSE](https://github.com/schlomo/odl-drawcustom-designer/blob/main/LICENSE)
and [NOTICE](https://github.com/schlomo/odl-drawcustom-designer/blob/main/NOTICE)
(bundled dependency attributions: `THIRD_PARTY.md`, included in this package).
