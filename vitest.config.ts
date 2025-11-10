/// <reference types="vitest" />

import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        onConsoleLog(log, type) {
            const method = type === 'stderr' ? 'error' : 'log';
            console[method](log);
        },
    },
});
