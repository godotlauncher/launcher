import * as fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { templateLstat } from './template-files.util.js';
import {
    readTemplateVersionLayout,
    readTemplateVersionMigration,
    templateVersionMigrationRecoveryId,
    writeTemplateVersionLayout,
    writeTemplateVersionMigration,
} from './template-version-migration.store.js';

const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('node:fs', () => ({
    promises: { readFile: vi.fn(), unlink: vi.fn() },
}));
vi.mock('../json-store/atomic-json-file.adapter.js', () => ({
    AtomicJsonFileAdapter: class {
        write = write;
    },
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () => path.resolve('imports'),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    templateLstat: vi.fn(),
}));

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(templateLstat).mockResolvedValue({
        isFile: () => true,
        isSymbolicLink: () => false,
    } as fs.Stats);
});

describe('per-version recovery metadata', () => {
    it.each([1, 2] as const)(
        'reads and writes recovery format %s without upgrading an interrupted move',
        async (version) => {
            const record = {
                version,
                id: '10000000-0000-4000-8000-000000000001',
                projectPath: path.resolve('project'),
                launchPath: path.resolve('editor', 'Godot'),
                setId: '4.4.stable',
                editorSetId: '4.4.stable',
                root: 'active',
                localRealPath: path.resolve('local'),
                sharedRoot: path.resolve('shared'),
                choice: 'use-shared',
                beforeSelections: {},
                files: [
                    {
                        relative: 'custom-file',
                        size: 20,
                        mode: 0o644,
                        hash: version === 1 ? 'a'.repeat(64) : '',
                    },
                ],
                ...(version === 2
                    ? {
                          transfer: 'shared',
                          sourceIdentity: { dev: 1, ino: 123 },
                      }
                    : {}),
            };
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(record),
            );
            const parsed = await readTemplateVersionMigration();
            expect(parsed).toEqual(record);
            if (!parsed) throw new Error('Expected recovery inputs');
            await writeTemplateVersionMigration(parsed);
            expect(JSON.parse(write.mock.calls[0][1])).toEqual(record);
        },
    );

    it('rejects a new recovery record without its original folder identity', async () => {
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify({
                version: 2,
                id: '10000000-0000-4000-8000-000000000001',
                projectPath: path.resolve('project'),
                launchPath: path.resolve('editor', 'Godot'),
                setId: '4.4.stable',
                editorSetId: '4.4.stable',
                root: 'active',
                localRealPath: path.resolve('local'),
                sharedRoot: path.resolve('shared'),
                choice: 'use-shared',
                beforeSelections: {},
                files: [],
                transfer: 'shared',
            }),
        );
        await expect(readTemplateVersionMigration()).rejects.toThrow();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('leaves absence available for normal template operations', async () => {
        vi.mocked(templateLstat).mockResolvedValue(undefined);
        expect(await templateVersionMigrationRecoveryId()).toBeUndefined();
        expect(
            await readTemplateVersionLayout(path.resolve('editor')),
        ).toBeUndefined();
        expect(fs.promises.readFile).not.toHaveBeenCalled();
    });
    it.each(['{bad JSON', '{"version":100}'])(
        'keeps damaged recovery data visible and refuses to execute it: %s',
        async (raw) => {
            vi.mocked(fs.promises.readFile).mockResolvedValue(raw);
            expect(await templateVersionMigrationRecoveryId()).toMatch(
                /^[a-f0-9-]{36}$/,
            );
            await expect(readTemplateVersionMigration()).rejects.toThrow();
            expect(fs.promises.unlink).not.toHaveBeenCalled();
            expect(write).not.toHaveBeenCalled();
        },
    );
    it('does not follow a redirected recovery file', async () => {
        vi.mocked(templateLstat).mockResolvedValue({
            isFile: () => false,
            isSymbolicLink: () => true,
        } as fs.Stats);
        expect(await templateVersionMigrationRecoveryId()).toBeDefined();
        await expect(readTemplateVersionMigration()).rejects.toThrow(
            'errors.unsafe',
        );
        expect(fs.promises.readFile).not.toHaveBeenCalled();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('rejects a version ownership record containing a traversal key before writing', async () => {
        await expect(
            writeTemplateVersionLayout(path.resolve('editor'), {
                version: 1,
                root: 'active',
                managed: {
                    '../foreign': '10000000-0000-4000-8000-000000000001',
                },
            }),
        ).rejects.toThrow();
        expect(write).not.toHaveBeenCalled();
    });
});
