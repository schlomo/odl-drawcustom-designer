# Deployment & build configuration

How to build, host, and customize this app for production. For day-to-day development commands, see the [README](../README.md#development).

## Build-time environment variables

All `VITE_*` variables are read **at build time** and baked into the static bundle. They are not runtime secrets and are visible in the shipped JavaScript.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_BASE_PATH` | No | See [below](#vite_base_path-defaults) | URL prefix for assets (trailing slash recommended for subpaths). |
| `VITE_HEADER_LEGAL_HTML` | No | *(empty)* | HTML for the second header line (e.g. Impressum / Datenschutz links). Trusted content only — rendered with `dangerouslySetInnerHTML`. |
| `VITE_GIT_BRANCH` | No | local `git rev-parse --abbrev-ref HEAD`, or CI `GITHUB_REF_NAME` | Branch label in the header. |
| `VITE_GIT_REVISION` | No | local `git rev-parse --short=7 HEAD`, or CI `GITHUB_SHA` (7 chars) | Commit label in the header. |

#### `VITE_BASE_PATH` defaults

| Context | Default when unset | Set in |
|---------|-------------------|--------|
| `npm run dev` / local `npm run build` | `/` | [`vite.config.ts`](../vite.config.ts) (`base: process.env.VITE_BASE_PATH ?? '/'`) |
| GitHub Pages production (`main`) | `/<repository-name>/` | [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) |
| GitHub Pages PR preview | `/<repository-name>/pr-preview/pr-<n>/` | same workflow (always set per PR) |

Override locally or via the repository variable `VITE_BASE_PATH` (production CI only). PR preview paths are fixed by the workflow.

### CI-only inputs (automatic)

These are set by GitHub Actions; you normally do not set them locally.

| Variable | Set by | Purpose |
|----------|--------|---------|
| `GITHUB_SHA` | GitHub Actions | Full commit SHA for production builds. |
| `GITHUB_REF_NAME` | GitHub Actions | Branch name for production builds. |

### Examples

**Local dev** (`VITE_BASE_PATH` defaults to `/`):

```bash
npm run dev
```

**Local subpath build** (mimic GitHub Pages production default for this repo):

```bash
VITE_BASE_PATH=/odl-drawcustom-designer/ npm run build
```

**Legal / imprint links** in the header subline:

```bash
VITE_HEADER_LEGAL_HTML='<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a>' npm run build
```

Use single quotes around the value so the shell does not interpret inner double quotes. Relative `href` values resolve against the deployed site origin.

**Override git metadata** (e.g. reproducible builds):

```bash
VITE_GIT_BRANCH=release-1.0 VITE_GIT_REVISION=abc1234 npm run build
```

## GitHub Pages

Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) — [JamesIves/github-pages-deploy-action](https://github.com/JamesIves/github-pages-deploy-action) (production) + [rossjrw/pr-preview-action](https://github.com/rossjrw/pr-preview-action) (PR previews).

### One-time repository setup

1. **Settings → Pages** — source **Deploy from a branch**, branch **`gh-pages`**, folder **`/` (root)**. Do not use the “GitHub Actions” Pages source; PR previews deploy into the same `gh-pages` branch under `pr-preview/`.
2. **Settings → Actions → General → Workflow permissions** — **Read and write permissions**.

After each push to `gh-pages`, GitHub runs an internal **“pages build and deployment”** job (not defined in this repo) to publish the site.

### Deploy triggers

| Trigger | Result |
|---------|--------|
| Push to `main` | Production at `https://<user>.github.io/<repo>/` |
| Pull request (same repo) | Preview at `…/pr-preview/pr-<n>/` + sticky PR comment (QR code) |
| PR closed | Preview removed automatically |

Fork PRs do not get previews ([upstream limitation](https://github.com/rossjrw/pr-preview-action#setup)).

### Repository variables (optional)

Set under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Purpose |
|----------|---------|
| `VITE_BASE_PATH` | Override production CI default `/<repo-name>/` (e.g. custom domain at `/`). |
| `VITE_HEADER_LEGAL_HTML` | HTML for the header legal subline on production deploys. |

PR preview builds do not set `VITE_HEADER_LEGAL_HTML`; add it to the preview job in `pages.yml` if previews should show the same links.

## Self-hosted / other static hosts

1. `npm ci && npm run lint && npm test && npm run build`
2. Serve the `dist/` directory at your chosen path.
3. Set `VITE_BASE_PATH` to that path when building (defaults to `/` if omitted — see [defaults](#vite_base_path-defaults)).
4. Optionally set `VITE_HEADER_LEGAL_HTML` for jurisdiction-specific footer links.

## Header layout

The app header has three columns: **title** (left), **metadata** (center), **toolbar** (right).

The center column has two rows:

1. Privacy headline · GitHub · branch · revision
2. Optional legal subline from `VITE_HEADER_LEGAL_HTML` (hidden when empty)
