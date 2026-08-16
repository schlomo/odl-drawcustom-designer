import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Third-party license inventory for bundled npm dependencies (issue #103),
 * shipped as the `THIRD_PARTY.md` release asset and inside the npm package.
 * NOT a heavyweight scanner — package.json license fields suffice; fails
 * loudly on a missing license field (AGENTS.md, "fail early and loudly").
 *
 * The dependency list is the **transitive closure** of production runtime
 * dependencies reachable from package.json's own "dependencies" map (issue
 * #113 review finding: the direct-deps-only list missed packages like
 * crelt/style-mod/w3c-keyname that @codemirror/view itself pulls in at
 * install time). `vite.lib.config.ts` bundles every one of those — direct
 * and transitive — into the single self-contained ESM (no code splitting,
 * no externals — docs/bundle-audit.md), so the full closure, not just the
 * direct deps, is the exact set compiled into the artifact. The closure is
 * derived from `package-lock.json`'s locked graph (production dependencies
 * only, devDependencies never followed) — deterministic from the committed
 * lockfile, no bundler introspection needed.
 */

export interface DependencyLicenseInfo {
  name: string
  version: string
  license: string
  link?: string
}

/** One `packages` entry from a v3 `package-lock.json`. */
export interface LockedPackageEntry {
  version?: string
  dependencies?: Record<string, string>
  /** True when this entry is reachable only via devDependencies — never followed. */
  dev?: boolean
}

export interface PackageLockFile {
  packages: Record<string, LockedPackageEntry>
}

/** Sorted direct dependency names from package.json — the seed for the transitive closure below. */
export function bundledDependencyNames(packageJson: { dependencies?: Record<string, string> }): string[] {
  return Object.keys(packageJson.dependencies ?? {}).sort()
}

/**
 * Resolves `depName`, required by the package at `fromPath` (a
 * `package-lock.json` `packages` key, or `''` for the repo root itself), to
 * its own `packages` key — mirroring Node's node_modules resolution: check
 * the requiring package's own nested `node_modules` first, then walk up one
 * path segment at a time until the root `node_modules` is reached. Skips
 * `dev`-only entries so a dependency link is never chased into the
 * devDependencies-only part of the graph.
 */
export function resolveLockedDependencyPath(
  packages: Record<string, LockedPackageEntry>,
  fromPath: string,
  depName: string,
): string | undefined {
  const segments = fromPath.split('/').filter(Boolean)
  for (let i = segments.length; i >= 0; i -= 1) {
    const prefix = segments.slice(0, i).join('/')
    const candidate = prefix ? `${prefix}/node_modules/${depName}` : `node_modules/${depName}`
    const entry = packages[candidate]
    if (entry && !entry.dev) {
      return candidate
    }
  }
  return undefined
}

/**
 * Recursive closure of production runtime dependencies reachable from
 * `directDependencyNames`, traversing `package-lock.json`'s locked graph
 * (each package's own "dependencies" field only — never devDependencies).
 * Returns a map of package name → its `package-lock.json` `packages` key,
 * one entry per distinct package name (first path found wins; a name is
 * never visited twice). Throws loudly if the lockfile doesn't contain a
 * dependency reachable from the graph — an out-of-date lockfile, not
 * something to paper over.
 */
export function resolveTransitiveRuntimeDependencyPaths(
  packageLock: PackageLockFile,
  directDependencyNames: string[],
): Map<string, string> {
  const { packages } = packageLock
  const resolvedPaths = new Map<string, string>()
  const queue: Array<{ name: string; fromPath: string }> = directDependencyNames.map((name) => ({
    name,
    fromPath: '',
  }))

  while (queue.length > 0) {
    const { name, fromPath } = queue.shift()!
    if (resolvedPaths.has(name)) {
      continue
    }

    const path = resolveLockedDependencyPath(packages, fromPath, name)
    if (!path) {
      throw new Error(
        `Cannot resolve "${name}" (required by "${fromPath || 'package.json'}") in package-lock.json — ` +
          'the lockfile looks out of date; run `npm install` and commit the update',
      )
    }
    resolvedPaths.set(name, path)

    const entry = packages[path]!
    for (const depName of Object.keys(entry.dependencies ?? {})) {
      if (!resolvedPaths.has(depName)) {
        queue.push({ name: depName, fromPath: path })
      }
    }
  }

  return resolvedPaths
}

function readInstalledPackageJson(packagePath: string, repoRoot: string): Record<string, unknown> {
  const path = join(repoRoot, packagePath, 'package.json')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(
      `Cannot read installed package.json at ${path} — is it installed? (${(error as Error).message})`,
      { cause: error },
    )
  }
  return JSON.parse(raw) as Record<string, unknown>
}

/**
 * Reads name/version/license/link for one installed dependency from
 * `<repoRoot>/<packagePath>/package.json`. Throws loudly when the license
 * field is missing — no silent "unknown license" fallback.
 */
export function readDependencyLicenseInfo(name: string, packagePath: string, repoRoot: string): DependencyLicenseInfo {
  const pkg = readInstalledPackageJson(packagePath, repoRoot)
  const license = pkg.license
  if (typeof license !== 'string' || license.trim().length === 0) {
    throw new Error(
      `Package "${name}"@${String(pkg.version)} has no "license" field in its package.json — ` +
        'cannot generate THIRD_PARTY.md without one (fail loudly, no "unknown" fallback)',
    )
  }
  const homepage = typeof pkg.homepage === 'string' ? pkg.homepage : undefined
  const repositoryUrl =
    typeof pkg.repository === 'object' && pkg.repository !== null && 'url' in pkg.repository
      ? String((pkg.repository as { url?: unknown }).url)
      : undefined
  return {
    name,
    version: String(pkg.version),
    license,
    link: homepage ?? repositoryUrl,
  }
}

/** License info for every resolved dependency (name → package-lock path), sorted by name. */
export function collectBundledDependencyInfo(
  resolvedPaths: Map<string, string>,
  repoRoot: string,
): DependencyLicenseInfo[] {
  return [...resolvedPaths.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, packagePath]) => readDependencyLicenseInfo(name, packagePath, repoRoot))
}

const DOCS_THIRD_PARTY_URL =
  'https://github.com/schlomo/odl-drawcustom-designer/blob/main/docs/THIRD_PARTY.md'

/**
 * Renders the bundled-dependency license table as markdown. Pure formatting
 * — no filesystem access — so it's fully unit-tested independent of what's
 * actually installed.
 */
export function generateThirdPartyMarkdown(deps: DependencyLicenseInfo[]): string {
  const rows = deps
    .map((dep) => `| ${dep.name} | ${dep.version} | ${dep.license} | ${dep.link ?? ''} |`)
    .join('\n')
  return `# Third-party notices (bundled dependencies)

Auto-generated by \`tools/thirdPartyNotices.ts\` for the odl-drawcustom-designer
library build — every package listed here, direct or transitive, is compiled
into the single \`odl-drawcustom-designer.js\` ESM. For the repository's
broader attribution (vendored docs, fonts, non-bundled upstream ecosystems)
see [\`docs/THIRD_PARTY.md\`](${DOCS_THIRD_PARTY_URL}).

| Package | Version | License | Link |
|---|---|---|---|
${rows}
`
}
