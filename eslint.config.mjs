import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.migration-backup/**',
      '**/build/**',
      'artifacts/mockup-sandbox/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Tune noisy false positives while keeping real security & a11y rules strict
      'security/detect-object-injection': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
