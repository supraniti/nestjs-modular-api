// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules WITH TYPE-CHECKING (provides parser + plugin)
  ...tseslint.configs.recommendedTypeChecked,

  // Prettier integration
  prettierRecommended,

  // Project-level settings for TS files
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs'],
    languageOptions: {
      // node/jest globals
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      // We compile with NodeNext; ESLint should parse as modules, not commonjs
      sourceType: 'module',
      parserOptions: {
        // Let typescript-eslint discover your tsconfig automatically
        projectService: true,
        // Ensure relative tsconfig resolution works
        tsconfigRootDir: import.meta.dirname,
        // Not strictly needed, but keeps parser happy with modern syntax
        ecmaVersion: 'latest',
      },
    },
    rules: {
      // keep your local choices
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // (Do NOT disable no-unsafe-assignment/call/return — they’ll go green now)
    },
  },
];
