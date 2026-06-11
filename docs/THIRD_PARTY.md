# Third-party notices

This file supplements [`NOTICE`](../NOTICE) at the repository root. The **ODL/OEPL Drawcustom Designer** application is licensed under [Apache-2.0](../LICENSE).

## This project

| Item | License | Copyright |
|------|---------|-----------|
| **odl-drawcustom-designer** (application source) | [Apache-2.0](../LICENSE) | Schlomo Schapiro (2026) |

## Vendored in this repository

| Item | Path | Upstream | License |
|------|------|----------|---------|
| drawcustom field reference | [`docs/spec/supported_types.md`](spec/supported_types.md) | [OpenEPaperLink/Home_Assistant_Integration](https://github.com/OpenEPaperLink/Home_Assistant_Integration) | Apache-2.0 |
| Default fonts | `public/fonts/ppb.ttf`, `public/fonts/rbm.ttf` | [OEPL HA integration assets](https://github.com/OpenEPaperLink/Home_Assistant_Integration/tree/main/custom_components/open_epaper_link/imagegen/assets) | Apache-2.0 (repository; no separate font license file upstream) |

When updating `supported_types.md`, preserve this attribution and reconcile with upstream.

## Key runtime dependencies (npm)

| Package | Use | License |
|---------|-----|---------|
| [React](https://github.com/facebook/react) | UI | MIT |
| [CodeMirror 6](https://github.com/codemirror/dev) | YAML editor | MIT |
| [Zod](https://github.com/colinhacks/zod) | Schema validation | MIT |
| [yaml](https://github.com/eemeli/yaml) | YAML parse/serialize | ISC |
| [Nunjucks](https://github.com/mozilla/nunjucks) | Template preview | BSD-2-Clause |
| [opentype.js](https://github.com/opentypejs/opentype.js) | Font metrics | MIT |
| [Dexie](https://github.com/dexie/Dexie.js) | IndexedDB | Apache-2.0 |
| [pako](https://github.com/nodeca/pako) | Share-link compression | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | QR preview | MIT |
| [@mdi/js](https://github.com/Templarian/MaterialDesign-JS) | MDI icon paths | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) | Build (dev) | MIT |

Full transitive license list: from the repo root, run:

```bash
npx license-checker --summary
```

## Upstream ecosystems (compatibility only)

These projects are **not** bundled in this app but define protocols and HA integrations this editor targets:

| Project | License | Notes |
|---------|---------|-------|
| [OpenEPaperLink/OpenEPaperLink](https://github.com/OpenEPaperLink/OpenEPaperLink) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | Firmware — **NonCommercial** |
| [OpenDisplay/Firmware](https://github.com/OpenDisplay/Firmware) | [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) | Firmware — copyleft |
| [OpenEPaperLink HA integration](https://github.com/OpenEPaperLink/Home_Assistant_Integration) | Apache-2.0 | `open_epaper_link.drawcustom` |
| [OpenDisplay HA integration](https://github.com/OpenDisplay/Home_Assistant_Integration) | Apache-2.0 | `opendisplay.drawcustom` |
| [Home Assistant Core — opendisplay](https://github.com/home-assistant/core) | Apache-2.0 | `upload_image` only |
| [OpenDisplay Language spec](https://opendisplay.org/protocol/open-display-language.html) | (not stated on site) | Reference documentation |

Trademarks (*OpenEPaperLink*, *OpenDisplay*, *Home Assistant*, *Material Design Icons*, etc.) belong to their respective owners.
