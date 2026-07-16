import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { version } from './package.json';

const contractsRoot = fileURLToPath(
    new URL('./shared/src/contracts', import.meta.url),
);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react()],
    root: 'renderer',
    base: './',
    build: {
        outDir: '../dist-react',
        emptyOutDir: true,
    },
    server: {
        port: 5123,
        strictPort: true,
    },
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    },
    resolve: {
        alias: [
            {
                find: '@shared/contracts',
                replacement: `${contractsRoot}/index.d.ts`,
            },
        ],
    },
});
