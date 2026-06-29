import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.dev-shots', '.playwright-mcp']),
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
    rules: {
      // HMR-only nicety; our consolidated ui.tsx re-exports a few Radix primitives.
      'react-refresh/only-export-components': 'warn',
      // Loading from IndexedDB on key change is a legitimate external-sync effect.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
