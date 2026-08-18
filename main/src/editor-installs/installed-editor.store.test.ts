import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { InstalledEditorStore } from './installed-editor.store.js';

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

describe('InstalledEditorStore', () => {
    it('returns an empty list for missing, empty, or malformed storage', async () => {
        const directory = await createTemporaryDirectory();

        await expect(
            createStore(path.join(directory, 'missing.json')).list(),
        ).resolves.toEqual([]);

        const emptyPath = path.join(directory, 'empty.json');
        await fs.writeFile(emptyPath, '', 'utf8');
        await expect(createStore(emptyPath).list()).resolves.toEqual([]);

        const malformedPath = path.join(directory, 'malformed.json');
        await fs.writeFile(malformedPath, '{invalid', 'utf8');
        await expect(createStore(malformedPath).list()).resolves.toEqual([]);
    });

    it('normalises ordering and prefers a valid duplicate', async () => {
        const directory = await createTemporaryDirectory();
        const filePath = path.join(directory, 'installed-releases.json');
        await fs.writeFile(
            filePath,
            JSON.stringify([
                createRelease('4.4-stable', { valid: false }),
                createRelease('4.3-stable'),
                createRelease('4.4-stable', {
                    editor_path: '/valid/Godot',
                    valid: true,
                }),
            ]),
            'utf8',
        );

        const releases = await createStore(filePath).list();

        expect(releases.map((release) => release.version)).toEqual([
            '4.3-stable',
            '4.4-stable',
        ]);
        expect(releases[1]).toMatchObject({
            base_version: '4.4',
            editor_path: '/valid/Godot',
            valid: true,
        });
    });

    it('serialises concurrent updates without dropping either editor', async () => {
        const directory = await createTemporaryDirectory();
        const filePath = path.join(directory, 'installed-releases.json');
        const store = createStore(filePath);

        await Promise.all([
            store.put(createRelease('4.3-stable')),
            store.put(createRelease('4.4-stable')),
        ]);

        await expect(store.list()).resolves.toHaveLength(2);
        await expect(fs.readFile(filePath, 'utf8')).resolves.toContain(
            '4.4-stable',
        );
        await expect(fs.readdir(directory)).resolves.toEqual([
            'installed-releases.json',
        ]);
    });

    it('replaces and removes only the matching identity and location', async () => {
        const directory = await createTemporaryDirectory();
        const store = createStore(
            path.join(directory, 'installed-releases.json'),
        );
        const original = createRelease('4.3-stable');
        const replacement = createRelease('4.3-stable', {
            editor_path: '/replacement/Godot',
            install_path: '/replacement',
        });

        await store.put(original);
        await store.put(replacement);
        await expect(store.remove(original)).resolves.toEqual([
            expect.objectContaining(replacement),
        ]);
        await expect(store.remove(replacement)).resolves.toEqual([]);
    });
});

/** Creates a real store backed by the atomic JSON adapter. */
function createStore(filePath: string): InstalledEditorStore {
    return new InstalledEditorStore(
        new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
        filePath,
    );
}

/** Creates a temporary directory for one store test. */
async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-installed-editors-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * Creates one installed editor record.
 *
 * @param version - Official editor version.
 * @param overrides - Values that replace defaults.
 * @returns One installed editor.
 */
function createRelease(
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    const versionNumber = Number.parseFloat(version);
    return {
        version,
        version_number: versionNumber,
        install_path: `/editors/${version}`,
        editor_path: `/editors/${version}/Godot`,
        platform: 'linux',
        arch: 'x64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2026-01-01T00:00:00Z',
        valid: true,
        ...overrides,
    };
}
