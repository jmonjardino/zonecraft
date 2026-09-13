import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['build/**', 'dist/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'types/**/*.d.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
