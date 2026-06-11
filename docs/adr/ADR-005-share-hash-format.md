# ADR-005: Share hash format and excluded data

## Status

Accepted (revised)

## Context

Users need to share designs via URL without a backend. Asset blobs and HA mock values are machine-local and must not bloat the link.

Deployment target is **not fixed**: the app may be served from a custom domain, a subpath on any host, or GitHub Pages. Share links must work regardless of where the app is hosted.

## Decision

Share state lives in the **URL fragment** only — independent of origin, domain, or base path:

```
#d=<base64url-compressed-payload>
```

Typical payloads start with `eJ` (gzip/deflate via pako). Example:

```
#d=eJxLzkksKlYoLi1JLEnVUSjPL8lMLsnMz1NISSxJLElV0FBIzS9ILEpV...
```

Examples (all equivalent in what they encode; only the origin/path differs):

- `https://design.example.com/#d=…`
- `https://example.com/tools/oepl/#d=…`
- `http://localhost:5173/#d=…`

The app reads `location.hash` on load; it does **not** assume `github.io`, `/oepl-designer/`, or any particular hostname.

**Payload** (JSON before compression):

```json
{
  "v": 1,
  "name": "Project name",
  "canvas": { "width": 296, "height": 128, "rotation": 0, "accent": "red" },
  "service": { "background": "white", "rotate": 0, "dither": 2 },
  "elements": []
}
```

**Compression:** pako deflate + base64url (proven pattern used by other drawcustom designers).

**Excluded from hash:** IndexedDB assets, HA mock state, edit history entries.

**Share URL construction:** `window.location.origin + window.location.pathname + '#d=' + encoded` — so copied links preserve the deployer's path automatically.

On load: restore metadata + elements; re-bind assets from local IndexedDB by exact YAML path; show banner for missing assets.

**Build-time base path** (Vite `base`) is a separate concern: set via `VITE_BASE_PATH` at build time for subpath hosting. It affects asset URLs, not the hash format.

## Consequences

- Links work on any host/path the app is deployed to
- Hash routing avoids server-side rewrite rules for SPA fallback
- Copied share URLs remain valid when the recipient uses the same deployment URL
- Previews still need local re-upload of assets keyed by YAML path

## Alternatives considered

- **Hard-coded `github.io/oepl-designer` URLs** — rejected; does not match custom domain/path hosting
- **Query param `?design=`** — acceptable fallback; hash preferred so fragments are not sent to servers/logs
- **Include mocks in hash** — deferred; default exclude keeps URLs smaller
