import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,

  {
    plugins: { prettier: prettierPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // React Native / Expo globals
        __DEV__: 'readonly',
        alert: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        global: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Ignorierte Pfade
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'supabase/functions/**',
      'coverage/**',
      'babel.config.js',
      'jest.config.js',
      'metro.config.js',
    ],
  },
];
