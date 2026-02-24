import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules', 'build', 'dist', 'src/supabase', 'supabase'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // React hooks — catches conditional hooks and stale dep arrays (real bugs)
      ...reactHooks.configs.recommended.rules,

      // React Compiler rules (v7) — downgrade to warn; these are optimization hints for
      // Concurrent Mode / React Compiler compatibility, not correctness bugs. Fixing them
      // across 100+ files is tracked separately (items 4 & 8 in the tech debt backlog).
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/gating': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/unsupported-syntax': 'warn',

      // Explicit `any` — warn so existing debt surfaces without blocking the build
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars — warn, ignore underscore-prefixed intentional ignores
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  }
);
