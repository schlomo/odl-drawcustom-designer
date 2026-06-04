/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  plugins: [react(), ...(isVitest ? [] : [tailwindcss()])],
  base: process.env.VITE_BASE_PATH ?? '/',
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
