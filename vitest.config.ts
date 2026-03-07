/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        watch: false,
        onConsoleLog(log, type) {
            const method = type === 'stderr' ? 'error' : 'log';
            console[method](log);
        },
    },
});
