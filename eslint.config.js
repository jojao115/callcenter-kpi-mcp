import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Por stdio, o stdout é do protocolo MCP: o servidor só escreve no stderr.
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['src/seed/run.ts'],
    rules: { 'no-console': 'off' },
  },
);
