import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildThirdPartyMarkdown } from './autoRelease.ts'
import { invalidConsumerSource, validConsumerSource } from './npmTypesConsumerFixture.ts'
import { NPM_PACKAGE_NAME } from './npmPackage.ts'
import { stageNpmPackage } from './stageNpmPackage.ts'

/**
 * Scratch-consumer acceptance test for issue #122 ("Ship bundled .d.ts with
 * the library build and npm package"): `npm pack`s the staged package for
 * real, installs the tarball into a throwaway consumer project, and runs
 * `tsc --noEmit` against two fixture files —
 *
 * - a correct one (tools/npmTypesConsumerFixture.ts's `validConsumerSource`)
 *   that MUST type-check cleanly, proving `mount()`/`MountHandle` resolve
 *   and are usable;
 * - a broken one (`invalidConsumerSource`) that MUST fail with SPECIFICALLY
 *   TS2353 (bad option name) and TS2345 (wrong argument type) — not just
 *   "some error" — proving the `.d.ts` actually constrains callers rather
 *   than degrading to `any`.
 *
 * Runs on laptop or CI identically (AGENTS.md): `npm run verify:types` (or
 * `node tools/verifyNpmTypes.ts` directly) from the repo root, no env vars
 * required. Wired into CI's `checks` job (`.github/workflows/pages.yml`) on
 * every PR.
 *
 * It rebuilds the library itself so a stale artifact can never produce a
 * false pass, then stages an npm package the same way `tools/autoRelease.ts`
 * does for a real release (reusing the same tested `stageNpmPackage`/
 * `buildThirdPartyMarkdown` functions — this is not a parallel test-only
 * staging path). **Side effect note (issue #122 review finding):** the build
 * is directed at its own scratch `--outDir` (a temp directory), NOT the real
 * `dist-lib/` — running this concurrently with something else that reads
 * `dist-lib/` (a local Playwright e2e run, another `build:lib` invocation) is
 * safe, and no `APP_VERSION`-stamped build ever overwrites what a developer
 * or another process has sitting in `dist-lib/`.
 */

const TEST_VERSION = '0.0.1'

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8' })
}

/** Runs `tsc -p .` in `cwd`, capturing output regardless of success. Never throws. */
function runTsc(tscBin: string, cwd: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(tscBin, ['-p', '.'], { cwd, encoding: 'utf8' })
    return { ok: true, output }
  } catch (error) {
    const output =
      error && typeof error === 'object' && 'stdout' in error
        ? String((error as { stdout?: unknown }).stdout ?? '')
        : String(error)
    return { ok: false, output }
  }
}

function main(): void {
  const repoRoot = process.cwd()
  const workDir = mkdtempSync(join(tmpdir(), 'verify-npm-types-'))

  try {
    // Scratch outDir (not the real dist-lib/) — see the file header's side-effect note.
    const distLibDir = join(workDir, 'dist-lib')
    console.log(`1/5 Building the library into a scratch outDir (${distLibDir})...`)
    execFileSync(
      'npx',
      ['vite', 'build', '--config', 'vite.lib.config.ts', '--outDir', distLibDir, '--emptyOutDir'],
      {
        stdio: 'inherit',
        cwd: repoRoot,
        env: { ...process.env, APP_VERSION: TEST_VERSION },
      },
    )

    const distLibJsPath = join(distLibDir, 'odl-drawcustom-designer.js')
    const distLibDtsPath = join(distLibDir, 'odl-drawcustom-designer.d.ts')

    const stagingDir = join(workDir, 'dist-npm')
    console.log(`2/5 Staging the npm package into ${stagingDir}...`)
    stageNpmPackage({
      version: TEST_VERSION,
      repoRoot,
      distLibJsPath,
      distLibDtsPath,
      stagingDir,
      thirdPartyMarkdown: buildThirdPartyMarkdown(repoRoot),
    })

    console.log('3/5 npm pack-ing the staged package...')
    run('npm', ['pack'], stagingDir)
    const tarballName = readdirSync(stagingDir).find((name) => name.endsWith('.tgz'))
    if (!tarballName) {
      throw new Error(`npm pack did not produce a .tgz in ${stagingDir}`)
    }
    const tarballPath = join(stagingDir, tarballName)
    console.log(`    -> ${tarballPath}`)

    const consumerDir = join(workDir, 'consumer')
    mkdirSync(consumerDir, { recursive: true })
    writeFileSync(
      join(consumerDir, 'package.json'),
      `${JSON.stringify({ name: 'verify-npm-types-consumer', version: '0.0.0', private: true }, null, 2)}\n`,
    )

    console.log('4/5 Installing the tarball into a throwaway consumer project...')
    // Copy the tarball into the consumer directory and install by relative
    // path — an absolute-path `npm install` can behave inconsistently across
    // npm versions/platforms, whereas a plain relative filename is exactly
    // how a host's lockfile would reference it if this were vendored.
    const localTarballName = 'odl-drawcustom-designer.tgz'
    cpSync(tarballPath, join(consumerDir, localTarballName))
    run('npm', ['install', `./${localTarballName}`, '--no-save', '--no-audit', '--no-fund'], consumerDir)

    console.log('5/5 Type-checking the valid and invalid consumer fixtures...')
    // Each fixture gets its own subdirectory + tsconfig.json (no "files"/
    // "include" override, so tsc's default — every .ts file under the
    // config's own directory — picks up exactly the one fixture file present).
    // Module resolution still finds `consumerDir/node_modules` by walking up
    // parent directories, same as Node's own require resolution, so there is
    // no need to duplicate the installed package per fixture. TS 6's stricter
    // CLI (TS5112) refuses a file argument alongside a discovered
    // tsconfig.json, which is why this uses `-p <dir>` instead of a bare file
    // argument.
    const tsconfigContent = `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          lib: ['ES2023', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
      },
      null,
      2,
    )}\n`

    const validDir = join(consumerDir, 'valid')
    mkdirSync(validDir, { recursive: true })
    writeFileSync(join(validDir, 'tsconfig.json'), tsconfigContent)
    writeFileSync(join(validDir, 'app.ts'), validConsumerSource(NPM_PACKAGE_NAME))

    const invalidDir = join(consumerDir, 'invalid')
    mkdirSync(invalidDir, { recursive: true })
    writeFileSync(join(invalidDir, 'tsconfig.json'), tsconfigContent)
    writeFileSync(join(invalidDir, 'app.ts'), invalidConsumerSource(NPM_PACKAGE_NAME))

    // Reuse this repo's own TypeScript install (already a pinned
    // devDependency) rather than fetching a second copy into the consumer
    // project — same compiler, no extra network dependency, and this repo's
    // `tsc` behaves identically regardless of which directory it type-checks.
    const tscBin = join(repoRoot, 'node_modules', '.bin', 'tsc')

    console.log('\n--- tsc valid/app.ts (expected: PASS) ---')
    const validResult = runTsc(tscBin, validDir)
    console.log(validResult.output || '(no output)')
    if (!validResult.ok) {
      throw new Error('valid/app.ts failed to type-check but was expected to pass — see tsc output above.')
    }
    console.log('PASSED as expected: valid/app.ts type-checks cleanly.\n')

    console.log('--- tsc invalid/app.ts (expected: FAIL with TS2353 and TS2345) ---')
    const invalidResult = runTsc(tscBin, invalidDir)
    console.log(invalidResult.output || '(no output)')
    if (invalidResult.ok) {
      throw new Error(
        'invalid/app.ts type-checked cleanly but was expected to fail — the .d.ts is not constraining callers ' +
          '(a bad option name and a wrong argument type both went unnoticed).',
      )
    }
    // Not just "some error" — the exact two errors this fixture is designed
    // to trigger, so a future change that makes the fixture fail for an
    // unrelated reason (a typo, a missing import) can't slip through as a
    // false "FAILED as expected".
    const hasBadOptionNameError = invalidResult.output.includes('TS2353')
    const hasWrongArgumentTypeError = invalidResult.output.includes('TS2345')
    if (!hasBadOptionNameError || !hasWrongArgumentTypeError) {
      throw new Error(
        `invalid/app.ts failed, but not with the expected error codes (bad option name: TS2353 ` +
          `${hasBadOptionNameError ? 'found' : 'MISSING'}; wrong argument type: TS2345 ` +
          `${hasWrongArgumentTypeError ? 'found' : 'MISSING'}) — see tsc output above.`,
      )
    }
    console.log('FAILED as expected: invalid/app.ts does not type-check (TS2353 + TS2345 both present).\n')

    console.log('All scratch-consumer checks passed: mount()/MountHandle are correctly typed and enforced.')
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main()
}
