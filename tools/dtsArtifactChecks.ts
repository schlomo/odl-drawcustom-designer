/**
 * Post-emit soundness checks for the bundled library declaration file
 * (issue #122 review findings, MINOR 4). `assertNoDtsDiagnostics`
 * (`tools/dtsDiagnostics.ts`) catches TypeScript *errors* during declaration
 * generation, but a clean compile can still emit a `.d.ts` that is wrong in
 * ways TypeScript itself never flags:
 *
 * - **empty or missing the public API** — a misconfigured `include`/entry
 *   could produce a technically-valid empty declaration file (this
 *   repository shipped exactly that during development, before `bundleTypes`
 *   was configured correctly — see the PR's tool-choice notes).
 * - **an ambient `declare module`/`declare global`** — MAJOR 1: `bundleTypes`
 *   preserves any ambient module augmentation reachable from the program and
 *   appends it verbatim to the rolled-up file. The published `.d.ts` must
 *   describe ONLY the embed surface, never leak an internal dependency's
 *   shim into a consumer's own view of that module (a real install of that
 *   dependency plus `skipLibCheck: false` can hard-conflict with it).
 * - **an external `import`** — `@microsoft/api-extractor` inlines every type
 *   it can, but a type it cannot safely inline (e.g. a complex generic from
 *   an external package, reachable from an exported field) is instead
 *   imported at the top of the rolled-up file. Since the published
 *   `package.json` declares no `dependencies` (the ESM is fully
 *   self-contained — `tools/npmPackage.ts`), any import statement in the
 *   `.d.ts` names a package a consumer's own `tsc` cannot resolve
 *   (`TS2307`), even though `npm run build:lib` itself would exit 0.
 *
 * `vite.lib.config.ts` wires `assertSoundDtsArtifacts` into the `dts()`
 * plugin's `afterBuild` hook, which receives the exact file(s) written to
 * `dist-lib/` — the real published bytes, not an intermediate representation.
 */

const DECLARE_MODULE_OR_GLOBAL = /^[ \t]*declare\s+(module|global)\b/m
const IMPORT_STATEMENT = /^[ \t]*import\b.*$/m
const MOUNT_DECLARATION = /\bdeclare function mount\(/

/** Every problem found with one bundled declaration file's content; empty when it's sound. */
export function findDtsArtifactProblems(content: string): string[] {
  const problems: string[] = []

  if (content.trim().length === 0) {
    problems.push('the file is empty')
  }
  if (!MOUNT_DECLARATION.test(content)) {
    problems.push('the file does not declare mount() — the embed entry\'s public API is missing')
  }
  if (DECLARE_MODULE_OR_GLOBAL.test(content)) {
    problems.push(
      'the file contains an ambient "declare module"/"declare global" — an internal dependency shim ' +
        'leaked into the public types (issue #122 MAJOR 1); eliminate the ambient module at its source ' +
        '(a typed local wrapper, like src/core/renderer/bidi-module.ts) instead of an ambient .d.ts shim',
    )
  }
  if (IMPORT_STATEMENT.test(content)) {
    problems.push(
      'the file contains an "import" statement — the bundled .d.ts must be fully self-contained; an ' +
        'import here means a type reachable from the embed surface resolves to an external package this ' +
        "npm package does not declare as a dependency, and a consumer's own tsc cannot resolve it (TS2307)",
    )
  }

  return problems
}

/** Throws naming every problem across all emitted files when any is unsound; no-op otherwise. */
export function assertSoundDtsArtifacts(emittedFiles: ReadonlyMap<string, string>): void {
  if (emittedFiles.size === 0) {
    throw new Error(
      `Bundled declaration file failed its soundness checks — failing the build rather than shipping a ` +
        `broken .d.ts (AGENTS.md, "fail early and loudly"): no declaration files were emitted at all`,
    )
  }

  const problemsByFile = [...emittedFiles.entries()]
    .map(([path, content]) => ({ path, problems: findDtsArtifactProblems(content) }))
    .filter(({ problems }) => problems.length > 0)

  if (problemsByFile.length === 0) {
    return
  }

  const lines = problemsByFile.flatMap(({ path, problems }) => problems.map((problem) => `  ${path}: ${problem}`))
  throw new Error(
    `Bundled declaration file failed its soundness checks — failing the build rather than shipping a ` +
      `broken .d.ts (AGENTS.md, "fail early and loudly"):\n${lines.join('\n')}`,
  )
}
