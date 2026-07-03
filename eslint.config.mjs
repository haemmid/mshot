import n from 'eslint-plugin-n'
import unicorn from 'eslint-plugin-unicorn'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/', '*.tmp-*', '/tmp/']
  },
  n.configs['flat/recommended'],
  unicorn.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        module: 'readonly'
      }
    },
    rules: {
      // Node.js — CLI needs process.exit()
      'n/no-process-exit': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off',
      // We target Node 22, parseArgs is stable since 20.0.0
      'n/no-unsupported-features/node-builtins': 'off',

      // Unicorn — tune for CLI scripts
      'unicorn/filename-case': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/import-style': 'off',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/no-null': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/isolated-functions': 'off',
      'unicorn/catch-error-name': 'off',
      'unicorn/prefer-split-limit': 'off',
      'unicorn/relative-url-style': 'off',
      'unicorn/prefer-add-event-listener': 'off',

      // CLI tools use console.error for diagnostics
      'no-console': 'off'
    }
  },
  // Prettier must be last — disables conflicting ESLint rules
  prettierConfig
]
