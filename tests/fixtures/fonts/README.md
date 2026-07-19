# Font test fixtures

## InterVariable.ttf

- **Source:** [`rsms/inter`](https://github.com/rsms/inter) release [`v4.1`](https://github.com/rsms/inter/releases/tag/v4.1), asset `Inter-4.1.zip`, file `InterVariable.ttf`.
- **SHA-256:** `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf`
- **License:** SIL Open Font License 1.1 — see [`InterVariable.LICENSE.txt`](./InterVariable.LICENSE.txt) in this directory (copied verbatim from the release zip's `LICENSE.txt`).
- **Why it's here:** used by `tests/core/renderer/variable-font-parity.test.ts` (issue #10). This is a real, unmodified variable TrueType font (`fvar`/`gvar`/`avar`/`hvar` tables present) that reproduces the reported bug: uploading it as a text element's font made the element vanish completely from the canvas. The equivalent Google Fonts download (`Inter-VariableFont_opsz,wght.ttf`, named in the original issue) is the same underlying font family/build; this repo uses the official upstream release artifact instead of re-downloading from Google Fonts' CDN.
- Not used by the app itself (no `public/fonts/` bundling) — test-only fixture.
