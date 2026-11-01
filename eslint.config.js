// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// TypeScript 7 remains the compiler. ESLint uses Microsoft's side-by-side TS6
// compatibility package because typescript-eslint needs the JavaScript API.
export default [
  {
    ignores: ['**/dist/**', '**/demo-dist/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts', 'apps/web/src/vendor/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off', // Checked by TypeScript across browser and Node targets.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
];
