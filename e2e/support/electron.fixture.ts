import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as playwrightElectron } from '@playwright/test';

export * from '@playwright/test';

const preloadPath = fileURLToPath(
    new URL('./network-preload.cjs', import.meta.url),
);

/** Launches Electron with network fixtures active before startup migrations.
 * @param options - Playwright launch options, including isolated fixture paths.
 */
async function launch(
    options: Parameters<typeof playwrightElectron.launch>[0] = {},
) {
    const logDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-test-network-'),
    );
    const logPath = path.join(logDirectory, 'unexpected-requests.log');
    const env =
        options.env ??
        Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        );
    let application: Awaited<ReturnType<typeof playwrightElectron.launch>>;
    try {
        application = await playwrightElectron.launch({
            ...options,
            args: ['--require', preloadPath, ...(options.args ?? [])],
            env: { ...env, GODOT_LAUNCHER_E2E_NETWORK_LOG: logPath },
        });
    } catch (error) {
        await fs.rm(logDirectory, { recursive: true, force: true });
        throw error;
    }
    const close = application.close.bind(application);
    let closed = false;
    application.close = async () => {
        if (closed) return;
        closed = true;
        try {
            await close();
            const unexpectedRequests = await fs
                .readFile(logPath, 'utf8')
                .catch((error: NodeJS.ErrnoException) => {
                    if (error.code === 'ENOENT') return '';
                    throw error;
                });
            if (unexpectedRequests.trim())
                throw new Error(unexpectedRequests.trim());
        } finally {
            await fs.rm(logDirectory, { recursive: true, force: true });
        }
    };
    return application;
}

export const _electron = { launch };
