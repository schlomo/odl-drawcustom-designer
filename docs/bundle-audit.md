# Bundle audit

One-time bundle-composition audit for issue [#22](https://github.com/schlomo/odl-drawcustom-designer/issues/22)
(re-scoped 2026-07-19: **code splitting rejected** — this documents what the
bundle is, why it stays that way, and what actually travels over the wire).

Measured 2026-07-27 on `main` (`50b3628`), Vite 8 (rolldown), `@mdi/js` 7.4.47.

## Re-running the audit

This is a one-off measurement, not a maintained npm script (the no-code-splitting
decision below rests on artifact shape, not on re-checking composition numbers
periodically). To reproduce:

```bash
npm i -D rollup-plugin-visualizer
```

Temporarily add it to the `plugins` array in `vite.config.ts` and
`vite.lib.config.ts`:

```ts
import { visualizer } from 'rollup-plugin-visualizer'
// ...
plugins: [
  // ...existing plugins,
  visualizer({ filename: 'reports/bundle-app.html', template: 'treemap', gzipSize: true, brotliSize: true }),
  visualizer({ filename: 'reports/bundle-app.json', template: 'raw-data', gzipSize: true, brotliSize: true }),
]
```

Then build and read the reports:

```bash
npm run build && npm run build:lib
# reports/bundle-*.html — interactive treemaps
# reports/bundle-*.json — raw per-module data
```

Revert the config edits and `npm uninstall rollup-plugin-visualizer` afterward —
normal builds must stay free of the plugin.

## What the bundle is

| Artifact | Raw | gzip (wire, see below) | brotli‑11 (local) |
|---|---|---|---|
| App build `dist/assets/index-*.js` | 4,578,082 B (4.37 MiB) | 1,382,003 B (1.32 MiB) | ~1.05 MiB |
| Library build `dist-lib/odl-drawcustom-designer.js` | 5,656,799 B (5.39 MiB) | 1,676,688 B (1.60 MiB) | ~1.26 MiB |

Top contributors (visualizer rendered lengths, pre-minification — read the
proportions, not the absolute bytes; identical ranking in both builds):

| # | Module | Rendered | gzip share | What it is |
|---|---|---|---|---|
| 1 | `@mdi/js` (`mdi.js`) | ~3,037 KB | ~823 KB (~60% of wire) | Full Material Design Icons path data |
| 2 | `react-dom` | ~449 KB | ~85 KB | React renderer |
| 3 | `opentype.js` | ~442 KB | ~85 KB | Font parsing/shaping for HA-parity text rendering (ADR-007) |
| 4 | CodeMirror (`@codemirror/view` + state/language/autocomplete/…) | ~315 KB + ~250 KB | ~79 KB + ~65 KB | YAML/Jinja editor (ADR-009) |
| 5 | `nunjucks` | ~179 KB | ~37 KB | Jinja template evaluator (ADR-004) |
| 6 | `yaml` | ~167 KB | ~59 KB | YAML round-trip parser |
| 7 | app code (`src/`) | ~330 KB | ~95 KB | designer itself |
| 8 | `dexie`, `zod`, `pako`, `qrcode`, `bidi-js` | ~450 KB combined | ~120 KB | storage, schema, share-hash, QR, RTL |

**Library build extra (~1 MiB raw):** Vite library mode inlines all assets as
base64 — the two bundled fonts (`rbm.ttf` 165 KB, `ppb.ttf` 150 KB become
~420 KB of base64) plus showcase assets. That is the price of the
single-file, serve-from-anywhere artifact and is deliberate (see below). The
app build ships the same fonts as separate hashed files in `dist/assets/`.

## Why the MDI set stays complete

`import * as mdiPaths from '@mdi/js'` in `src/core/renderer/mdi-icons.ts`
(render any icon by name) and `src/ui/lib/mdi-icon-names.ts` (autocomplete
over every name). This is deliberately the **full** set:

- `drawcustom` payloads reference arbitrary icons by name at render time —
  there is no closed subset to tree-shake down to.
- Autocomplete must offer every valid name.
- Home Assistant frontend ships the same full MDI set; matching it is part of
  the parity goal.

## Wire compression, verified

### GitHub Pages (standalone app + published embed demo) — VERIFIED

Measured 2026-07-27 against the deployed site with `curl`:

| URL | `Accept-Encoding` | Response | Wire bytes |
|---|---|---|---|
| `…/assets/index-*.js` | `gzip` (also `gzip, deflate, br, zstd`) | `content-encoding: gzip` | **1,382,003** |
| `…/assets/index-*.js` | `br` only | identity (no encoding) | 4,578,141 |
| `…/embed/odl-drawcustom-designer.js` | `gzip` | `content-encoding: gzip` | **1,676,688** |

Conclusions:

- GitHub Pages (Fastly) **does apply gzip** to the large JS chunks —
  compression is effective end-to-end; real browsers download ~1.3 MiB
  (app) / ~1.6 MiB (library ESM), not 4.4/5.4 MiB.
- GitHub Pages does **not** serve brotli, even when the client prefers it —
  the ~0.3 MiB brotli saving measured locally is not realizable there.
- `cache-control: max-age=600` — repeat visits within 10 minutes are free;
  hashed asset names make longer client caching safe but Pages does not send
  immutable headers.

### Home Assistant static view (aiohttp, M4) — UNVERIFIED

The future HA integration serves the library ESM from an aiohttp static-file
view ([OpenDisplay HA PR #44](https://github.com/OpenDisplay/Home_Assistant_Integration/pull/44)).
Not measurable until M4 lands. What is known vs not:

- aiohttp's `FileResponse` does **not** compress on the fly; per aiohttp
  documentation it serves a pre-compressed `<file>.gz` sibling when the
  client accepts gzip. Whether the integration ships a `.gz` sibling (and
  whether its static view takes that code path) is an M4 decision —
  **UNVERIFIED**.
- Worst case (uncompressed 5.4 MiB) on the target deployment (LAN HA box):
  ~0.5 s at 100 Mbit/s, ~0.05 s at 1 Gbit/s, once per browser-cache
  lifetime. Acceptable even without compression; a `.gz` sibling is a cheap
  M4 follow-up if measured to matter.

Re-verify when M4 lands: fetch the panel JS from a real HA instance with
`curl -sI -H 'Accept-Encoding: gzip' …` and record `content-encoding` +
wire size here.

## Rejected alternatives (issue #22 ruling)

- **Code splitting / lazy chunks** — rejected. The MDI data would merely move
  to a lazy chunk (still downloaded on first icon render or autocomplete),
  while dynamic chunks break the library artifact contract: hosts would need
  base-path configuration, and the HA integration serves the designer from a
  dumb static view where **one self-contained ESM file** is the natural
  artifact (`vite.lib.config.ts` sets `codeSplitting: false` deliberately).
- **Manual chunks** — rejected, same artifact-contract reason; also pure
  bookkeeping, saves zero wire bytes.
- **Dynamic `import()` of MDI data** — rejected, it *is* code splitting.
- **CI bundle budget** — rejected; the size is an understood constant, not a
  regression vector worth a gate.
- **Parked option** (only if measured as a problem later): ship MDI path data
  as a separate statically-served asset fetched at startup — an ordinary
  `fetch()`, **not** an `import()` chunk, so the single-ESM contract holds.

Bottom line: ~60% of the wire size is the full MDI icon set, which is a
product requirement; gzip on the actual serving path is verified effective;
nothing here is worth the complexity of splitting.
