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
 * - a broken one (`invalidConsumerSource`) that MUST fail to type-check
 *   (a bad option name, a wrong argument type), proving the `.d.ts` actually
 *   constrains callers rather than degrading to `any`.
 *
 * Runs on laptop or CI identically (AGENTS.md): `node tools/verifyNpmTypes.ts`
 * from the repo root, no env vars required. It rebuilds the library itself
 * (`npm run build:lib`) so a stale `dist-lib/` can never produce a false
 * pass, then stages an npm package the same way `tools/autoRelease.ts` does
 * for a real release (reusing the same tested `stageNpmPackage`/
 * `buildThirdPartyMarkdown` functions — this is not a parallel test-only
 * staging path).
 */

const TEST_VERSION = '0.0.1'

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8' })
}

function main(): void {
  const repoRoot = process.cwd()

  console.log('1/5 Building the library (npm run build:lib)...')
  execFileSync('npm', ['run', 'build:lib'], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: { ...process.env, APP_VERSION: TEST_VERSION },
  })

  const distLibJsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.js')
  const distLibDtsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.d.ts')

  const workDir = mkdtempSync(join(tmpdir(), 'verify-npm-types-'))
  try {
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
    execFileSync(tscBin, ['-p', '.'], { cwd: validDir, stdio: 'inherit' })
    console.log('PASSED as expected: valid/app.ts type-checks cleanly.\n')

    console.log('--- tsc invalid/app.ts (expected: FAIL) ---')
    let invalidFailedAsExpected = false
    try {
      execFileSync(tscBin, ['-p', '.'], { cwd: invalidDir, stdio: 'inherit' })
    } catch {
      invalidFailedAsExpected = true
    }
    if (!invalidFailedAsExpected) {
      throw new Error(
        'invalid/app.ts type-checked cleanly but was expected to fail — the .d.ts is not constraining callers ' +
          '(a bad option name and a wrong argument type both went unnoticed).',
      )
    }
    console.log('FAILED as expected: invalid/app.ts does not type-check.\n')

    console.log('All scratch-consumer checks passed: mount()/MountHandle are correctly typed and enforced.')
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main()
}
