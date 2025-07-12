import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    // Base configuration for all files
    js.configs.recommended,

    // TypeScript configuration for source files
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                // Browser globals for UI files
                document: 'readonly',
                window: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                URL: 'readonly',
                fetch: 'readonly',
                open: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',

                // Node.js globals for electron files
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                NodeJS: 'readonly',

                // Browser types
                Window: 'readonly',
                HTMLInputElement: 'readonly',

                // TypeScript/JS types  
                React: 'readonly',
                JSX: 'readonly',

                // Test globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                vi: 'readonly',
                Mock: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            // TypeScript recommended rules
            ...tseslint.configs.recommended.rules,

            // React hooks rules
            ...reactHooks.configs.recommended.rules,

            // React refresh rules
            'react-refresh/only-export-components': [
                'warn',
                {
                    allowConstantExport: true,
                    allowExportNames: ['metadata', 'loader', 'action']
                },
            ],

            // Your custom rules
            'linebreak-style': ['error', 'unix'],
            'no-console': 'warn',
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'indent': ['error', 4],

            // Disable some strict rules that cause too many errors
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            'no-undef': 'off', // TypeScript handles this better
        },
    },

    // Ignore patterns
    {
        ignores: [
            'dist/**',
            'dist-react/**',
            'dist-electron/**',
            '*config.js',
            '*.cts',
            'eslint.config.js',
            '**/*.spec.ts',
            '**/*.test.ts',
            'e2e/**',
            'electron-builder-config.cjs',
            'node_modules/**',

        ],
    },
];
