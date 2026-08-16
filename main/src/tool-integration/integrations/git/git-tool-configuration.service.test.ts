import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../../../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../../../json-store/json-store-coordinator.service.js';
import { ToolIntegrationStore } from '../../tool-integration.store.js';
import { GitToolConfigurationService } from './git-tool-configuration.service.js';

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

describe('GitToolConfigurationService', () => {
    it('returns null without creating a missing store file', async () => {
        const { gitStore, storePath } = await createStores();

        await expect(gitStore.getProjectIdentityPreset()).resolves.toBeNull();
        await expect(fs.stat(storePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('normalizes and persists a project identity preset', async () => {
        const { gitStore, storePath } = await createStores();

        await expect(
            gitStore.saveProjectIdentityPreset({
                name: '  Example User  ',
                email: '  user@example.com  ',
                useForNewRepositories: false,
            }),
        ).resolves.toEqual({
            name: 'Example User',
            email: 'user@example.com',
            useForNewRepositories: false,
        });

        const persisted = JSON.parse(await fs.readFile(storePath, 'utf-8'));
        expect(persisted).toMatchObject({
            schemaVersion: 2,
            tools: {
                git: {
                    settings: {
                        enabled: true,
                        executablePathOverride: null,
                        executableArgsOverride: null,
                    },
                    configuration: {
                        projectIdentityPreset: {
                            name: 'Example User',
                            email: 'user@example.com',
                            useForNewRepositories: false,
                        },
                    },
                    installations: {},
                },
            },
        });
    });

    it('rejects incomplete presets without persisting submitted values', async () => {
        const { gitStore, storePath } = await createStores();

        await expect(
            gitStore.saveProjectIdentityPreset({
                name: ' ',
                email: 'user@example.com',
                useForNewRepositories: false,
            }),
        ).rejects.toThrow();
        await expect(fs.stat(storePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('treats malformed stored presets as absent', async () => {
        const { gitStore, toolStore } = await createStores();
        await toolStore.updateConfiguration('git', () => ({
            projectIdentityPreset: {
                name: 'Example User',
                useForNewRepositories: false,
            },
        }));

        await expect(gitStore.getProjectIdentityPreset()).resolves.toBeNull();
    });

    it('clears only the preset from Git configuration', async () => {
        const { gitStore, toolStore } = await createStores();
        await toolStore.updateConfiguration('git', () => ({
            providerValue: { enabled: true },
        }));
        await gitStore.saveProjectIdentityPreset({
            name: 'Example User',
            email: 'user@example.com',
            useForNewRepositories: true,
        });

        await expect(
            gitStore.saveProjectIdentityPreset(null),
        ).resolves.toBeNull();
        await expect(toolStore.getConfiguration('git')).resolves.toEqual({
            providerValue: { enabled: true },
        });
    });

    it('serializes concurrent preset and tool configuration writes', async () => {
        const { gitStore, toolStore } = await createStores();

        await Promise.all([
            gitStore.saveProjectIdentityPreset({
                name: 'Example User',
                email: 'user@example.com',
                useForNewRepositories: true,
            }),
            toolStore.updateConfiguration('git', (configuration) => ({
                ...configuration,
                providerValue: true,
            })),
        ]);

        await expect(toolStore.getConfiguration('git')).resolves.toEqual({
            projectIdentityPreset: {
                name: 'Example User',
                email: 'user@example.com',
                useForNewRepositories: true,
            },
            providerValue: true,
        });
    });
});

/**
 * Creates Git and generic tool stores backed by one temporary file.
 *
 * @returns Configured stores and their shared file path.
 */
async function createStores(): Promise<{
    gitStore: GitToolConfigurationService;
    toolStore: ToolIntegrationStore;
    storePath: string;
}> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-git-tool-configuration-'),
    );
    temporaryDirectories.push(directory);
    const storePath = path.join(directory, 'tool-integrations.json');
    const toolStore = new ToolIntegrationStore(
        new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
        { directory, fileName: path.basename(storePath) },
    );
    return {
        gitStore: new GitToolConfigurationService(toolStore),
        toolStore,
        storePath,
    };
}
