import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const coreBoundaryRule = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react',
          message: 'src/core must not import React (ADR-001, ADR-006). Use src/ui for UI code.',
        },
        {
          name: 'react-dom',
          message: 'src/core must not import React DOM (ADR-001, ADR-006).',
        },
      ],
      patterns: [
        {
          group: ['react/*', 'react-dom/*'],
          message: 'src/core must not import React packages (ADR-001, ADR-006).',
        },
      ],
    },
  ],
}

const uiCoreBoundaryRule = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['**/src/core/*'],
          message: 'Import from src/core/index.ts only (ADR-001). Use the public core barrel.',
        },
        {
          group: ['../../core/*', '../core/*', '../../../core/*'],
          message: 'Import from src/core/index.ts only (ADR-001). Use the public core barrel.',
        },
      ],
    },
  ],
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: coreBoundaryRule,
  },
  {
    files: ['tests/core/**/*.{ts,tsx}'],
    rules: coreBoundaryRule,
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/embed/**/*.{ts,tsx}'],
    rules: uiCoreBoundaryRule,
  },
  {
    files: ['tests/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/core/*'],
              message: 'Import from src/core/index.ts only (ADR-001).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
