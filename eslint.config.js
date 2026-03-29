import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Global ignores
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '!eslint.config.js'] },

  // Base TypeScript config for all .ts/.tsx files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript rules — keep it light, let tsc handle type errors
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Server — allow console.log (it's a Node.js backend)
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // React-specific config for client
  {
    files: ['client/**/*.ts', 'client/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Prettier compat — disables formatting rules that conflict
  prettierConfig,
];
