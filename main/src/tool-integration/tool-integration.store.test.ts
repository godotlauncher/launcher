import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ToolIntegrationStore } from './tool-integration.store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) =>
                fs.rm(directory, { recursive: true, force: true }),
            ),
    );
});

describe('ToolIntegrationStore', () => {
    it('returns defaults without creating a missing store file', async () => {
        const storePath = await createStorePath();
        const store = createStore(storePath);

        await expect(store.get('git')).resolves.toEqual({
            enabled: true,
            executablePathOverride: null,
            executableArgsOverride: null,
        });
        await expect(fs.stat(storePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('updates one tool without replacing other tool records', async () => {
        const storePath = await createStorePath();
        const store = createStore(storePath);
        await store.update('existing', {
            enabled: false,
            executablePathOverride: '/existing/tool',
        });

        const settings = await store.update('git', {
            executablePathOverride: ' /custom/git ',
            executableArgsOverride: ['--wrapper'],
        });

        expect(settings).toEqual({
            enabled: true,
            executablePathOverride: '/custom/git',
            executableArgsOverride: ['--wrapper'],
        });
        await expect(store.get('existing')).resolves.toEqual({
            enabled: false,
            executablePathOverride: '/existing/tool',
            executableArgsOverride: null,
        });
        const persisted = JSON.parse(await fs.readFile(storePath, 'utf-8'));
        expect(persisted).toMatchObject({
            schemaVersion: 1,
            tools: {
                git: {
                    settings: {
                        enabled: true,
                        executablePathOverride: '/custom/git',
                        executableArgsOverride: ['--wrapper'],
                    },
                    installations: {},
                },
            },
        });
    });

    it('stores detected installations by platform and architecture', async () => {
        const storePath = await createStorePath();
        const store = createStore(storePath);

        await store.setDetectedInstallation(
            'git',
            {
                executablePath: '/custom/git',
                executableArgs: ['--wrapper'],
                version: '2.0.0',
                source: 'override',
            },
            123,
            'settings-key',
        );

        await expect(store.getDetectedInstallation('git')).resolves.toEqual({
            installation: {
                executablePath: '/custom/git',
                executableArgs: ['--wrapper'],
                version: '2.0.0',
                source: 'override',
            },
            checkedAt: 123,
            settingsKey: 'settings-key',
        });
    });

    it('serializes concurrent updates through the shared JSON coordinator', async () => {
        const storePath = await createStorePath();
        const store = createStore(storePath);

        await Promise.all([
            store.update('git', { executablePathOverride: '/tools/git' }),
            store.update('git-lfs', {
                executablePathOverride: '/tools/git-lfs',
            }),
        ]);

        await expect(store.get('git')).resolves.toMatchObject({
            executablePathOverride: '/tools/git',
        });
        await expect(store.get('git-lfs')).resolves.toMatchObject({
            executablePathOverride: '/tools/git-lfs',
        });
    });

    it('rejects malformed or unsupported store data', async () => {
        const storePath = await createStorePath();
        await fs.writeFile(
            storePath,
            JSON.stringify({ schemaVersion: 2, tools: {} }),
            'utf-8',
        );

        await expect(createStore(storePath).get('git')).rejects.toThrow();
    });
});

/**
 * Creates a store backed by the production atomic JSON components.
 *
 * @param storePath - Absolute store path used by the test.
 * @returns A configured tool integration store.
 */
function createStore(storePath: string): ToolIntegrationStore {
    const coordinator = new JsonStoreCoordinatorService(
        new AtomicJsonFileAdapter(),
    );
    return new ToolIntegrationStore(coordinator, {
        directory: path.dirname(storePath),
        fileName: path.basename(storePath),
    });
}

/**
 * Creates a unique temporary path for one test store.
 *
 * @returns Absolute path to a missing tool integration store file.
 */
async function createStorePath(): Promise<string> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-tool-integrations-'),
    );
    temporaryDirectories.push(directory);
    return path.join(directory, 'tool-integrations.json');
}
