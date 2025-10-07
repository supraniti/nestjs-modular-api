import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      vue
    },
    rules: {
      'vue/html-self-closing': 'off'
    }
  }
];
