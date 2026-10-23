import fs from 'node:fs/promises';
import path from 'node:path';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { _electron, expect, test } from './support/electron.fixture';

/** Launches a fresh Electron home with pending startup migrations.
 * @param home - Isolated home directory seeded with committed fixtures.
 */
async function launch(home: string) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    return _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: {
            ...env,
            GODOT_LAUNCHER_E2E_FIXTURES: '1',
            GODOT_LAUNCHER_E2E_HOME_DIR: home,
        },
    });
}

test('startup migrations rebuild caches using mocked GitHub releases', async () => {
    const home = await createFixtureHome();
    const app = await launch(home);
    try {
        await getMainWindow(app);
        const configDir = path.join(home, '.gd-launcher');
        const state = JSON.parse(
            await fs.readFile(path.join(configDir, 'migrations.json'), 'utf8'),
        );
        expect(state.completed).toContainEqual(
            expect.objectContaining({ id: '2024-11-clear-release-cache' }),
        );
        const expectedReleases = JSON.parse(
            await fs.readFile('e2e/fixtures/releases.json', 'utf8'),
        ).releases;
        const expectedPrereleases = JSON.parse(
            await fs.readFile('e2e/fixtures/prereleases.json', 'utf8'),
        ).releases;
        for (const [filename, expected] of [
            ['releases.json', expectedReleases],
            ['prereleases.json', expectedPrereleases],
        ] as const) {
            const cache = JSON.parse(
                await fs.readFile(path.join(configDir, filename), 'utf8'),
            );
            expect(
                cache.releases
                    .map((release: { version: string }) => release.version)
                    .sort(),
            ).toEqual(
                expected
                    .map((release: { version: string }) => release.version)
                    .sort(),
            );
        }
        const result = await app.evaluate(async () => {
            const state = (
                globalThis as typeof globalThis & {
                    __launcherTestNetwork: {
                        requests: string[];
                        unexpectedRequests: string[];
                    };
                }
            ).__launcherTestNetwork;
            const first = await fetch(
                new Request(
                    'https://api.github.com/repos/godotengine/godot/releases?page=1&per_page=1',
                ),
            );
            const second = await fetch(
                new URL(
                    'https://api.github.com/repos/godotengine/godot/releases?page=2&per_page=1',
                ),
            );
            return {
                requests: state.requests,
                unexpected: state.unexpectedRequests,
                first: await first.json(),
                second: await second.json(),
            };
        });
        expect(
            result.requests.some((url) =>
                url.includes('/godot-builds/releases'),
            ),
        ).toBe(true);
        expect(result.unexpected).toEqual([]);
        expect(result.first[0].tag_name).toBe(expectedReleases[0].version);
        expect(result.second[0].tag_name).toBe(expectedReleases[1].version);
    } finally {
        await app.close();
        await fs.rm(home, { recursive: true, force: true });
    }
});

test('unmocked GitHub requests fail teardown even when the app catches the error', async () => {
    const home = await createFixtureHome();
    const app = await launch(home);
    try {
        await getMainWindow(app);
        const message = await app.evaluate(async () => {
            try {
                await fetch('https://api.github.com/user');
                return 'Request unexpectedly succeeded';
            } catch (error) {
                return (error as Error).message;
            }
        });
        expect(message).toContain(
            'Unexpected network request: https://api.github.com/user',
        );
        const sessionError = await app.evaluate(
            ({ net, session }) =>
                new Promise<string>((resolve) => {
                    const request = net.request({
                        url: 'https://github.com/fixture/release.zip',
                        session: session.fromPartition('electron-updater'),
                    });
                    request.on('error', (error) => resolve(error.message));
                    request.on('response', () => {
                        request.abort();
                        resolve('Request unexpectedly succeeded');
                    });
                    request.end();
                }),
        );
        expect(sessionError).toContain('ERR_BLOCKED_BY_CLIENT');
        await expect(app.close()).rejects.toThrow(
            'Unexpected network request: https://api.github.com/user',
        );
    } finally {
        await app.close();
        await fs.rm(home, { recursive: true, force: true });
    }
});

test('loopback fetch cannot follow a redirect around network mocks', async () => {
    const home = await createFixtureHome();
    const app = await launch(home);
    try {
        await getMainWindow(app);
        const result = await app.evaluate(async () => {
            const { createServer } = process.getBuiltinModule('node:http');
            const paths: string[] = [];
            const server = createServer((request, response) => {
                paths.push(request.url ?? '');
                if (request.url === '/start') {
                    response.writeHead(302, { location: '/redirect-target' });
                }
                response.end();
            });
            await new Promise<void>((resolve) =>
                server.listen(0, '127.0.0.1', resolve),
            );
            try {
                const address = server.address() as { port: number };
                let rejected = false;
                try {
                    await fetch(`http://127.0.0.1:${address.port}/start`);
                } catch {
                    rejected = true;
                }
                return { rejected, paths };
            } finally {
                await new Promise<void>((resolve, reject) =>
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    ),
                );
            }
        });
        expect(result).toEqual({ rejected: true, paths: ['/start'] });
    } finally {
        await app.close();
        await fs.rm(home, { recursive: true, force: true });
    }
});

test('closing an app which quit itself remains safe', async () => {
    const home = await createFixtureHome();
    const app = await launch(home);
    try {
        await getMainWindow(app);
        const closed = app.waitForEvent('close');
        await app.evaluate(({ app }) => app.quit());
        await closed;
        await app.close();
    } finally {
        await app.close();
        await fs.rm(home, { recursive: true, force: true });
    }
});
