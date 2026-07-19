/// <reference types="vitest" />

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contractsRoot = fileURLToPath(
    new URL('./shared/src/contracts', import.meta.url),
);

export default defineConfig({
    resolve: {
        alias: [
            {
                find: '@shared/contracts',
                replacement: `${contractsRoot}/index.d.ts`,
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
