/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedRoot = fileURLToPath(new URL('./shared/src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            {
                find: '@shared',
                replacement: `${sharedRoot}/index.d.ts`,
            },
            {
                find: /^@shared\/(.+)$/,
                replacement: `${sharedRoot}/$1`,
            },
        ],
    },
    test: {
        watch: false,
        setupFiles: ['./vitest.setup.ts'],
        onConsoleLog(log, type) {
            const method = type === 'stderr' ? 'error' : 'log';
            console[method](log);
        },
    },
});
