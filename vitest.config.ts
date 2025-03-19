/// <reference types="vitest" />

import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        onConsoleLog(log, type) {
            // eslint-disable-next-line no-console
            console[type](log);
        },
    },
});
