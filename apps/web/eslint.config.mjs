import eslint from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['lib/solana/actions.ts', 'lib/solana/readOnly.ts', 'lib/solana/server.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['lib/handoffs/policy.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    files: ['lib/db/jsonStore.ts'],
    rules: {
      'preserve-caught-error': 'off',
    },
  },
];
