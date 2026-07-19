/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gitBuildDefines } from './tools/buildDefines.ts'

const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  plugins: [react(), ...(isVitest ? [] : [tailwindcss()])],
  base: process.env.VITE_BASE_PATH ?? '/',
  define: gitBuildDefines(),
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
