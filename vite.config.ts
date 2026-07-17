/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveGitBranch, resolveGitPrNumber, resolveGitRevision } from './tools/gitRevision.ts'

const isVitest = Boolean(process.env.VITEST)

function readGitShortHead(): string | undefined {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function readGitBranch(): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function gitRevision(): string {
  return resolveGitRevision({
    vitest: isVitest,
    viteGitRevision: process.env.VITE_GIT_REVISION,
    githubSha: process.env.GITHUB_SHA,
    gitShortHead: readGitShortHead(),
  })
}

function gitBranch(): string {
  return resolveGitBranch({
    vitest: isVitest,
    viteGitBranch: process.env.VITE_GIT_BRANCH,
    githubRefName: process.env.GITHUB_REF_NAME,
    githubHeadRef: process.env.GITHUB_HEAD_REF,
    gitBranch: readGitBranch(),
  })
}

function gitPrNumber(): number {
  return resolveGitPrNumber({ githubRefName: process.env.GITHUB_REF_NAME }) ?? 0
}

export default defineConfig({
  plugins: [react(), ...(isVitest ? [] : [tailwindcss()])],
  base: process.env.VITE_BASE_PATH ?? '/',
  define: {
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(gitBranch()),
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(gitRevision()),
    'import.meta.env.VITE_GIT_PR_NUMBER': JSON.stringify(String(gitPrNumber())),
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  resolve: {
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/autocomplete',
      '@codemirror/lint',
      '@codemirror/lang-jinja',
      '@codemirror/lang-yaml',
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/ui/setup.ts'],
  },
})
