import * as fs from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { savedProjectMigrationSchema } from './saved-project-migration.schema.js';
import {
    clearSavedProjectMigration,
    readSavedProjectMigration,
    writeSavedProjectMigration,
} from './saved-project-migration.store.js';

const adapter = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { unlink: vi.fn() } }));
vi.mock('../json-store/atomic-json-file.adapter.js', () => ({
    AtomicJsonFileAdapter: class {
        read = adapter.read;
        write = adapter.write;
    },
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () =>
        path.resolve('fixture-config', 'export-templates'),
}));
vi.mock('./saved-project-migration.schema.js', () => ({
    savedProjectMigrationSchema: { parse: vi.fn() },
}));

const journalPath = path.resolve(
    'fixture-config',
    'export-templates',
    'saved-project-migration.json',
);
const migration = {
    version: 1 as const,
    projectPath: path.resolve('game'),
    launchPath: path.resolve('editor', 'Godot'),
    localPath: path.resolve('editor', 'editor_data', 'export_templates'),
    builds: [],
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(savedProjectMigrationSchema.parse).mockImplementation(
        (value) =>
            value as ReturnType<typeof savedProjectMigrationSchema.parse>,
    );
});

it('writes the validated migration as a durable journal', async () => {
    await writeSavedProjectMigration(migration);
    expect(savedProjectMigrationSchema.parse).toHaveBeenCalledWith(migration);
    expect(adapter.write).toHaveBeenCalledExactlyOnceWith(
        journalPath,
        JSON.stringify(migration, null, 2),
    );
});

it('reads and validates a saved journal, or returns no migration when absent', async () => {
    adapter.read.mockResolvedValueOnce(JSON.stringify(migration));
    await expect(readSavedProjectMigration()).resolves.toEqual(migration);
    expect(adapter.read).toHaveBeenCalledWith(journalPath);
    expect(savedProjectMigrationSchema.parse).toHaveBeenCalledWith(migration);

    adapter.read.mockResolvedValueOnce(undefined);
    await expect(readSavedProjectMigration()).resolves.toBeUndefined();
    expect(savedProjectMigrationSchema.parse).toHaveBeenCalledOnce();
});

it('ignores a missing journal while preserving other deletion errors', async () => {
    vi.mocked(fs.promises.unlink).mockRejectedValueOnce({ code: 'ENOENT' });
    await expect(clearSavedProjectMigration()).resolves.toBeUndefined();
    expect(fs.promises.unlink).toHaveBeenCalledWith(journalPath);

    vi.mocked(fs.promises.unlink).mockRejectedValueOnce({ code: 'EACCES' });
    await expect(clearSavedProjectMigration()).rejects.toMatchObject({
        code: 'EACCES',
    });
});
