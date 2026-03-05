import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';

export default [
  js.configs.recommended,

  {
    plugins: { prettier: prettierPlugin, react: reactPlugin },
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
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        FileReader: 'readonly',
        crypto: 'readonly',
        // Web globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        fail: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^React$', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
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
