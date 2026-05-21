import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { version } from './package.json';

const sharedRoot = fileURLToPath(new URL('./shared/src', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react()],
    base: './',
    build: {
        outDir: 'dist-react'
    },
    server: {
        port: 5123,
        strictPort: true
    },
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(version)
    },
    resolve: {
        alias: [
            {
                find: '@shared',
                replacement: `${sharedRoot}/index.d.ts`
            },
            {
                find: /^@shared\/(.+)$/,
                replacement: `${sharedRoot}/$1`
            }
        ]
    }

});
