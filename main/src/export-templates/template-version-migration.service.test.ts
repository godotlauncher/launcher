import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ImportedTemplateLibrary,
    ProjectDetails,
    TemplateMigrationVersionPlan,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsStore } from '../projects/projects.store.js';
import {
    importedTemplateFiles,
    readImportedTemplates,
    writeImportedTemplates,
} from './imported-templates.store.js';
import { updateTemplateFiles } from './template-file-update.util.js';
import {
    checkTemplateCapacity,
    readTemplateTree,
    type TemplateFile,
    templateLstat,
} from './template-files.util.js';
import type { TemplateMigrationSource } from './template-migration.types.js';
import type {
    TemplateVersionLayout,
    TemplateVersionMigration,
} from './template-version-migration.schema.js';
import { TemplateVersionMigrationService } from './template-version-migration.service.js';
import {
    clearTemplateVersionMigration,
    readTemplateVersionLayout,
    readTemplateVersionMigration,
    writeTemplateVersionLayout,
    writeTemplateVersionMigration,
} from './template-version-migration.store.js';

vi.mock('node:fs', () => ({
    promises: {
        mkdir: vi.fn(),
        readdir: vi.fn(),
        cp: vi.fn(),
        chmod: vi.fn(),
        rename: vi.fn(),
        symlink: vi.fn(),
        stat: vi.fn(),
        readlink: vi.fn(),
        realpath: vi.fn(),
        rm: vi.fn(),
        rmdir: vi.fn(),
        unlink: vi.fn(),
    },
}));
vi.mock('./template-projection.util.js', () => ({
    projectTemplateBuilds: vi.fn(),
}));
vi.mock('./template-runtime.util.js', () => ({
    getSharedTemplateRoot: () => path.resolve('shared'),
}));
vi.mock('./template-file-update.util.js', () => ({
    updateTemplateFiles: vi.fn(),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    templateLstat: vi.fn(),
    readTemplateTree: vi.fn(),
    checkTemplateCapacity: vi.fn(),
}));
vi.mock('./imported-templates.store.js', () => ({
    importedTemplateRoot: () => path.resolve('imports'),
    importedTemplateFiles: vi.fn(),
    readImportedTemplates: vi.fn(),
    writeImportedTemplates: vi.fn(),
}));
vi.mock('./template-version-migration.store.js', () => ({
    clearTemplateVersionMigration: vi.fn(),
    readTemplateVersionLayout: vi.fn(),
    readTemplateVersionMigration: vi.fn(),
    writeTemplateVersionLayout: vi.fn(),
    writeTemplateVersionMigration: vi.fn(),
}));

type Entry =
    | { kind: 'directory'; files: TemplateFile[] }
    | { kind: 'link'; target: string };
const entries = new Map<string, Entry>();
let inodes = new WeakMap<Entry, number>();
let nextInode = 1;
const editor = path.resolve('editor');
const local = path.join(editor, 'editor_data', 'export_templates');
const shared = path.resolve('shared');
const ids = ['4.3.stable', '4.4.stable', '4.4.stable.mono', '4.5.stable'];
const project = {
    path: path.resolve('project'),
    name: 'Night Garden',
    launch_path: path.join(editor, 'Godot'),
    release: { source: 'official', version: '4.4-stable', mono: false },
} as ProjectDetails;
const build: ImportedTemplateBuild = {
    id: '10000000-0000-4000-8000-000000000001',
    revision: '10000000-0000-4000-8000-000000000002',
    setId: ids[0],
    directoryName: 'night-garden',
    label: 'Night Garden',
    importedAt: '2026-01-01',
    archiveName: '',
    files: ['template'],
    sizeBytes: 20,
};
const target = path.resolve('imports', 'imported', ids[0], build.directoryName);
let saved: ProjectDetails;
let library: ImportedTemplateLibrary;
let layout: TemplateVersionLayout | undefined;
let journal: TemplateVersionMigration | undefined;
const list = vi.fn();
const update = vi.fn();
const createBuild = vi.fn();
let service: TemplateVersionMigrationService;

/** Creates a hashed sample version without reading real files.
 * @param hash - Distinct template content for one fixture version.
 */
function files(hash = 'a'): TemplateFile[] {
    return [
        { relative: 'template', size: 20, mode: 0o755, hash: hash.repeat(64) },
    ];
}
/** Captures the original collection expected by the reviewed batch. */
function source(): TemplateMigrationSource {
    return {
        projectPath: project.path,
        name: project.name,
        launchPath: project.launch_path,
        setId: ids[1],
        buildSelections: {},
        localRoot: local,
        localRealPath: local,
        sharedRoot: shared,
        entries: ids,
        files: ids.flatMap((id, index) =>
            files(String(index)).map((file) => ({
                ...file,
                relative: `${id}/${file.relative}`,
            })),
        ),
    };
}
/** Builds one exact reviewed effect for a fictional version.
 * @param choice - Reviewed policy.
 * @param setId - Version receiving that policy.
 */
function plan(
    choice: TemplateMigrationVersionPlan['choice'],
    setId = ids[0],
): TemplateMigrationVersionPlan {
    return {
        setId,
        choice,
        fileCount: 1,
        sizeBytes: 20,
        destination:
            choice === 'save-imported'
                ? 'imported'
                : choice === 'later'
                  ? 'local'
                  : 'shared',
        sharedFiles: choice === 'share-project' ? 'add-missing' : 'unchanged',
        localFiles:
            choice === 'later'
                ? 'keep'
                : choice === 'save-imported'
                  ? 'remove-after-verification'
                  : 'remove-after-connection',
        pending: choice === 'later',
    };
}
/** Returns metadata for one in-memory directory or link.
 * @param entry - Fictional filesystem entry, without following a link.
 */
function stat(entry?: Entry): fs.Stats | undefined {
    if (entry && !inodes.has(entry)) inodes.set(entry, nextInode++);
    return entry
        ? ({
              dev: 1,
              ino: inodes.get(entry),
              mode: 0o700,
              isDirectory: () => entry.kind === 'directory',
              isSymbolicLink: () => entry.kind === 'link',
              isFile: () => false,
          } as fs.Stats)
        : undefined;
}

/** Simulates the OS requiring a copy for the imported destination on another drive. */
function acrossDrives(): void {
    const rename = vi.mocked(fs.promises.rename).getMockImplementation();
    vi.mocked(fs.promises.rename).mockImplementation(async (...args) => {
        if (
            String(args[1]) === target &&
            String(args[0]).includes('version-backups')
        )
            throw Object.assign(new Error('Cross-device move'), {
                code: 'EXDEV',
            });
        return rename?.(...args);
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    entries.clear();
    inodes = new WeakMap();
    nextInode = 1;
    saved = structuredClone(project);
    library = { schemaVersion: 1, builds: [] };
    layout = undefined;
    journal = undefined;
    for (const directory of [
        editor,
        path.join(editor, 'editor_data'),
        local,
        shared,
        path.resolve('imports'),
    ])
        entries.set(directory, { kind: 'directory', files: [] });
    ids.forEach((id, index) => {
        entries.set(path.join(local, id), {
            kind: 'directory',
            files: files(String(index)),
        });
    });
    list.mockImplementation(async () => [saved]);
    update.mockImplementation(
        async (change: (projects: ProjectDetails[]) => ProjectDetails[]) => {
            [saved] = change([saved]);
            return [saved];
        },
    );
    createBuild.mockResolvedValue(build);
    service = new TemplateVersionMigrationService(
        { list, update } as unknown as ProjectsStore,
        createBuild,
    );
    vi.mocked(templateLstat).mockImplementation(async (filename) =>
        stat(entries.get(filename)),
    );
    vi.mocked(readTemplateTree).mockImplementation(async (filename) => {
        const entry = entries.get(filename);
        if (!entry) return [];
        if (entry.kind !== 'directory')
            throw new Error('exportTemplates:errors.unsafe');
        return structuredClone(entry.files);
    });
    vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
        String(filename),
    );
    vi.mocked(fs.promises.mkdir).mockImplementation(async (filename) => {
        if (!entries.has(String(filename)))
            entries.set(String(filename), { kind: 'directory', files: [] });
        return undefined;
    });
    vi.mocked(fs.promises.cp).mockImplementation(async (from, to) => {
        const original = entries.get(path.dirname(String(from)));
        const destination = entries.get(path.dirname(String(to)));
        if (original?.kind !== 'directory')
            throw new Error('Missing fixture source');
        if (destination?.kind === 'directory')
            destination.files.push(
                ...structuredClone(
                    original.files.filter(
                        (file) =>
                            file.relative.split('/')[0] ===
                            path.basename(String(from)),
                    ),
                ),
            );
        else throw new Error('Missing fixture destination');
    });
    vi.mocked(fs.promises.readdir).mockImplementation(
        async (directory, options) => {
            const entry = entries.get(String(directory));
            const names =
                entry?.kind === 'directory'
                    ? [
                          ...new Set([
                              ...entry.files.map(
                                  (file) => file.relative.split('/')[0],
                              ),
                              ...[...entries.keys()]
                                  .filter(
                                      (name) =>
                                          path.dirname(name) ===
                                          String(directory),
                                  )
                                  .map((name) => path.basename(name)),
                          ]),
                      ]
                    : [];
            return (
                typeof options === 'object' && options?.withFileTypes
                    ? names.map((name) => ({
                          name,
                          isDirectory: () =>
                              entries.get(path.join(String(directory), name))
                                  ?.kind === 'directory',
                          isSymbolicLink: () =>
                              entries.get(path.join(String(directory), name))
                                  ?.kind === 'link',
                      }))
                    : names
            ) as never;
        },
    );
    vi.mocked(fs.promises.rename).mockImplementation(async (from, to) => {
        const entry = entries.get(String(from));
        if (!entry) throw new Error('Missing fixture source');
        entries.set(String(to), entry);
        entries.delete(String(from));
        for (const [name, child] of [...entries]) {
            if (!name.startsWith(`${String(from)}${path.sep}`)) continue;
            entries.set(
                path.join(String(to), path.relative(String(from), name)),
                child,
            );
            entries.delete(name);
        }
    });
    vi.mocked(fs.promises.symlink).mockImplementation(async (to, from) => {
        entries.set(String(from), { kind: 'link', target: String(to) });
    });
    vi.mocked(fs.promises.readlink).mockImplementation(async (filename) => {
        const entry = entries.get(String(filename));
        if (entry?.kind !== 'link') throw new Error('Not a fixture link');
        return entry.target;
    });
    vi.mocked(fs.promises.stat).mockImplementation(async (filename) => {
        const entry = entries.get(String(filename));
        return stat(
            entry?.kind === 'link' ? entries.get(entry.target) : entry,
        ) as fs.Stats;
    });
    vi.mocked(fs.promises.rm).mockImplementation(async (filename) => {
        entries.delete(String(filename));
    });
    vi.mocked(fs.promises.rmdir).mockImplementation(async (filename) => {
        entries.delete(String(filename));
    });
    vi.mocked(fs.promises.unlink).mockImplementation(async (filename) => {
        entries.delete(String(filename));
    });
    vi.mocked(importedTemplateFiles).mockReturnValue(target);
    vi.mocked(readImportedTemplates).mockImplementation(async () =>
        structuredClone(library),
    );
    vi.mocked(writeImportedTemplates).mockImplementation(async (next) => {
        library = structuredClone(next);
    });
    vi.mocked(readTemplateVersionMigration).mockImplementation(
        async () => journal && structuredClone(journal),
    );
    vi.mocked(writeTemplateVersionMigration).mockImplementation(
        async (next) => {
            journal = structuredClone(next);
        },
    );
    vi.mocked(clearTemplateVersionMigration).mockImplementation(async () => {
        journal = undefined;
    });
    vi.mocked(readTemplateVersionLayout).mockImplementation(
        async () => layout && structuredClone(layout),
    );
    vi.mocked(writeTemplateVersionLayout).mockImplementation(
        async (_editor, next) => {
            layout = next && structuredClone(next);
        },
    );
    vi.mocked(updateTemplateFiles).mockImplementation(
        async (destination, original) => {
            const entry = entries.get(destination);
            const incoming = entries.get(original);
            if (entry?.kind !== 'directory' || incoming?.kind !== 'directory')
                throw new Error('Missing fixture collection');
            for (const file of incoming.files)
                if (
                    !entry.files.some(
                        (current) => current.relative === file.relative,
                    )
                )
                    entry.files.push(file);
        },
    );
});

describe('reviewed version execution', () => {
    it('drops stale ownership of replaced local folders without moving those folders', async () => {
        layout = {
            version: 1,
            root: 'active',
            managed: { [ids[1]]: '11111111-1111-4111-8111-111111111111' },
        };
        await service.execute(source(), plan('use-shared'), saved, vi.fn());
        expect(layout?.managed).not.toHaveProperty(ids[1]);
        expect(layout?.managed).toHaveProperty(ids[0]);
        expect(entries.get(path.join(local, ids[1]))).toEqual({
            kind: 'directory',
            files: files('1'),
        });
        expect(journal).toBeUndefined();
    });

    it('reconciles replaced local folders when recovering an already committed move', async () => {
        vi.mocked(fs.promises.rm)
            .mockRejectedValueOnce(new Error('Cleanup interrupted'))
            .mockRejectedValueOnce(new Error('Cleanup interrupted'));
        await expect(
            service.execute(source(), plan('use-shared'), saved, vi.fn()),
        ).rejects.toThrow('Cleanup interrupted');
        if (!layout) throw new Error('Expected committed layout');
        layout.managed[ids[1]] = '11111111-1111-4111-8111-111111111111';
        expect(await service.recover()).toMatchObject({ status: 'complete' });
        expect(layout.managed).not.toHaveProperty(ids[1]);
        expect(entries.get(path.join(local, ids[1]))?.kind).toBe('directory');
        expect(journal).toBeUndefined();
    });

    it('renames a whole folder without copying or reading its contents', async () => {
        const original = entries.get(path.join(local, ids[0]));
        await service.execute(source(), plan('save-imported'), saved, vi.fn());
        expect(entries.get(target)).toBe(original);
        expect(fs.promises.cp).not.toHaveBeenCalled();
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every((call) => call[1] === false),
        ).toBe(true);
        expect(writeTemplateVersionMigration).toHaveBeenCalledWith(
            expect.objectContaining({
                version: 2,
                transfer: 'move',
                files: files('0').map((file) => ({ ...file, hash: '' })),
            }),
        );
        expect(checkTemplateCapacity).toHaveBeenCalledWith(
            path.resolve('imports'),
            0,
        );
    });

    it('owns only its active recovery record while the rename is running', async () => {
        const rename = vi.mocked(fs.promises.rename).getMockImplementation();
        let ownedId = '';
        vi.mocked(fs.promises.rename).mockImplementation(async (...args) => {
            ownedId = journal?.id ?? '';
            expect(service.ownsActiveRecovery(ownedId)).toBe(true);
            expect(service.ownsActiveRecovery('other')).toBe(false);
            return rename?.(...args);
        });
        const report = vi.fn();
        await service.execute(source(), plan('save-imported'), saved, report);
        expect(report).toHaveBeenCalledWith('connecting');
        expect(report).toHaveBeenCalledWith('cleaning');
        expect(report).not.toHaveBeenCalledWith('copying');
        expect(service.ownsActiveRecovery(ownedId)).toBe(false);
    });

    it('copies once across drives and checks metadata without hashing', async () => {
        acrossDrives();
        const original = entries.get(path.join(local, ids[0]));
        await service.execute(source(), plan('save-imported'), saved, vi.fn());
        expect(entries.get(target)).not.toBe(original);
        expect(entries.get(target)).toEqual(original);
        expect(fs.promises.cp).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('version-backups'),
            path.join(target, 'template'),
            { recursive: true, force: false, errorOnExist: true },
        );
        expect(writeTemplateVersionMigration).toHaveBeenCalledWith(
            expect.objectContaining({
                version: 2,
                transfer: 'copy',
                targetIdentity: expect.objectContaining({
                    dev: 1,
                    ino: expect.any(Number),
                }),
            }),
        );
        expect(checkTemplateCapacity).toHaveBeenCalledWith(
            path.dirname(target),
            20,
        );
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every((call) => call[1] === false),
        ).toBe(true);
        expect(journal).toBeUndefined();
    });

    it('renames into a missing shared version without copying', async () => {
        const original = entries.get(path.join(local, ids[0]));
        await service.execute(source(), plan('share-project'), saved, vi.fn());
        expect(entries.get(path.join(shared, ids[0]))).toBe(original);
        expect(fs.promises.cp).not.toHaveBeenCalled();
        expect(updateTemplateFiles).not.toHaveBeenCalled();
        expect(journal).toBeUndefined();
    });

    it('restores a renamed folder if persisting its destination reports failure', async () => {
        const write = vi
            .mocked(writeTemplateVersionMigration)
            .getMockImplementation();
        vi.mocked(writeTemplateVersionMigration).mockImplementation(
            async (next) => {
                if (
                    next.version === 2 &&
                    next.transfer === 'move' &&
                    next.targetIdentity
                )
                    throw new Error('Interrupted destination write');
                return write?.(next);
            },
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Interrupted destination write');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.has(target)).toBe(false);
        expect(journal).toBeUndefined();
    });

    it('restores the retained original and removes an owned partial cross-drive copy', async () => {
        acrossDrives();
        vi.mocked(fs.promises.cp).mockImplementation(async (_from, to) => {
            const destination = entries.get(path.dirname(String(to)));
            if (destination?.kind === 'directory')
                destination.files = files('0').map((file) => ({
                    ...file,
                    size: 10,
                }));
            throw new Error('Copy interrupted');
        });
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Copy interrupted');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.has(target)).toBe(false);
        expect(journal).toBeUndefined();
    });

    it('restores originals if recording an unpublished copy destination fails', async () => {
        acrossDrives();
        const write = vi
            .mocked(writeTemplateVersionMigration)
            .getMockImplementation();
        vi.mocked(writeTemplateVersionMigration).mockImplementation(
            async (next) => {
                if (
                    next.version === 2 &&
                    next.transfer === 'copy' &&
                    next.targetIdentity
                )
                    throw new Error('Interrupted ownership write');
                return write?.(next);
            },
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Interrupted ownership write');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.has(target)).toBe(false);
        expect(fs.promises.cp).not.toHaveBeenCalled();
        expect(journal).toBeUndefined();
    });

    it('restores originals when publication of an owned empty destination fails', async () => {
        acrossDrives();
        const rename = vi.mocked(fs.promises.rename).getMockImplementation();
        vi.mocked(fs.promises.rename).mockImplementation(async (...args) => {
            if (path.basename(String(args[0])).startsWith('.migration-'))
                throw new Error('Interrupted publication');
            return rename?.(...args);
        });
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Interrupted publication');
        expect(entries.get(path.join(local, ids[0]))?.kind).toBe('directory');
        expect(
            [...entries.keys()].some((name) =>
                path.basename(name).startsWith('.migration-'),
            ),
        ).toBe(false);
        expect(journal).toBeUndefined();
    });

    it('preserves both folders when an interrupted copy contains an unrelated new file', async () => {
        acrossDrives();
        vi.mocked(fs.promises.cp).mockImplementation(async (_from, to) => {
            const destination = entries.get(path.dirname(String(to)));
            if (destination?.kind === 'directory')
                destination.files = [
                    { ...files('f')[0], relative: 'new-user-file' },
                ];
            throw new Error('Copy interrupted');
        });
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.recovery');
        expect(entries.get(target)?.kind).toBe('directory');
        expect(journal).toBeDefined();
        expect(fs.promises.rm).not.toHaveBeenCalled();
        const backup = vi.mocked(fs.promises.rename).mock.calls[0][1];
        expect(entries.get(String(backup))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
    });

    it('merges missing shared files with metadata checks and no content hashes', async () => {
        entries.set(path.join(shared, ids[1]), {
            kind: 'directory',
            files: files('f').map((file) => ({
                ...file,
                relative: 'retained',
            })),
        });
        await service.execute(
            source(),
            plan('share-project', ids[1]),
            saved,
            vi.fn(),
        );
        expect(entries.get(path.join(shared, ids[1]))?.kind).toBe('directory');
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            path.join(shared, ids[1]),
            expect.stringContaining('version-backups'),
            ['template'],
            [],
            true,
        );
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every((call) => call[1] === false),
        ).toBe(true);
    });

    it('retains originals when an existing shared file changes during copying', async () => {
        const retained = {
            ...files('f')[0],
            relative: 'retained',
            metadata: { mtimeMs: 1, ctimeMs: 1, ino: 1, dev: 1 },
        };
        entries.set(path.join(shared, ids[1]), {
            kind: 'directory',
            files: [retained],
        });
        const publish = vi.mocked(updateTemplateFiles).getMockImplementation();
        vi.mocked(updateTemplateFiles).mockImplementation(async (...args) => {
            await publish?.(...args);
            retained.metadata.mtimeMs = 2;
        });
        await expect(
            service.execute(
                source(),
                plan('share-project', ids[1]),
                saved,
                vi.fn(),
            ),
        ).rejects.toThrow('changed');
        expect(entries.get(path.join(local, ids[1]))?.kind).toBe('directory');
    });

    it('preserves nested empty directories when sharing into an existing version', async () => {
        entries.set(path.join(shared, ids[1]), {
            kind: 'directory',
            files: files('1'),
        });
        entries.set(path.join(local, ids[1], 'custom'), {
            kind: 'directory',
            files: [],
        });
        entries.set(path.join(local, ids[1], 'custom', 'empty'), {
            kind: 'directory',
            files: [],
        });
        await service.execute(
            source(),
            plan('share-project', ids[1]),
            saved,
            vi.fn(),
        );
        expect(
            entries.get(path.join(shared, ids[1], 'custom', 'empty'))?.kind,
        ).toBe('directory');
        expect(updateTemplateFiles).not.toHaveBeenCalled();
        expect(journal).toBeUndefined();
    });

    it('retains originals if a missing shared file is not copied correctly', async () => {
        entries.set(path.join(shared, ids[1]), {
            kind: 'directory',
            files: [],
        });
        vi.mocked(updateTemplateFiles).mockResolvedValue(undefined);
        await expect(
            service.execute(
                source(),
                plan('share-project', ids[1]),
                saved,
                vi.fn(),
            ),
        ).rejects.toThrow('exportTemplates:errors.changed');
        expect(entries.get(path.join(local, ids[1]))).toEqual({
            kind: 'directory',
            files: files('1'),
        });
        expect(update).not.toHaveBeenCalled();
        expect(journal).toBeUndefined();
    });
    it('keeps, shares, uses shared and defers different versions in one collection', async () => {
        const original = source();
        entries.set(path.join(shared, ids[1]), {
            kind: 'directory',
            files: files('f'),
        });
        entries.set(path.join(shared, ids[2]), {
            kind: 'directory',
            files: files('e'),
        });
        const phases: string[] = [];
        for (const [index, choice] of (
            ['save-imported', 'share-project', 'use-shared', 'later'] as const
        ).entries())
            saved = await service.execute(
                original,
                plan(choice, ids[index]),
                saved,
                (phase) => phases.push(phase),
            );
        expect(entries.get(target)).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.get(path.join(shared, ids[1]))).toEqual({
            kind: 'directory',
            files: files('f'),
        });
        expect(entries.get(path.join(shared, ids[2]))).toEqual({
            kind: 'directory',
            files: files('e'),
        });
        expect(entries.get(path.join(local, ids[3]))).toEqual({
            kind: 'directory',
            files: files('3'),
        });
        expect(saved.exportTemplateBuilds).toEqual({
            [ids[0]]: build.id,
            [ids[1]]: 'official',
            [ids[2]]: 'official',
        });
        expect(Object.keys(layout?.managed ?? {})).toEqual(ids.slice(0, 3));
        expect(library.builds).toEqual([build]);
        expect(fs.promises.cp).not.toHaveBeenCalled();
        expect(updateTemplateFiles).not.toHaveBeenCalled();
        expect(phases.filter((phase) => phase === 'copying')).toHaveLength(0);
        expect(journal).toBeUndefined();
    });
    it('does no reading, copying or persistence for Later', async () => {
        expect(
            await service.execute(source(), plan('later'), saved, vi.fn()),
        ).toBe(saved);
        expect(readTemplateVersionMigration).not.toHaveBeenCalled();
        expect(writeTemplateVersionMigration).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
    it('rejects changed source metadata before creating a journal or copy', async () => {
        entries.set(path.join(local, ids[0]), {
            kind: 'directory',
            files: files('f').map((file) => ({ ...file, size: 21 })),
        });
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.changed');
        expect(writeTemplateVersionMigration).not.toHaveBeenCalled();
        expect(fs.promises.cp).not.toHaveBeenCalled();
    });
    it('rejects changed project choices before creating copies', async () => {
        const expected = structuredClone(saved);
        saved.exportTemplateBuilds = { [ids[1]]: 'official' };
        await expect(
            service.execute(source(), plan('save-imported'), expected, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.changed');
        expect(fs.promises.cp).not.toHaveBeenCalled();
    });
    it('rejects insufficient space while every original is still in place', async () => {
        vi.mocked(checkTemplateCapacity).mockRejectedValue(
            new Error('exportTemplates:errors.space'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.space');
        expect(writeTemplateVersionMigration).not.toHaveBeenCalled();
        expect(fs.promises.rename).not.toHaveBeenCalled();
    });
    it('restores an original when a cross-drive copy fails the size check', async () => {
        acrossDrives();
        vi.mocked(fs.promises.cp).mockImplementation(async (_from, to) => {
            const destination = entries.get(path.dirname(String(to)));
            if (destination?.kind === 'directory')
                destination.files = files('f').map((file) => ({
                    ...file,
                    size: 10,
                }));
        });
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.changed');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.has(target)).toBe(false);
        expect(update).not.toHaveBeenCalled();
        expect(journal).toBeUndefined();
    });

    it('finishes interrupted rollback cleanup after the original has been restored', async () => {
        acrossDrives();
        vi.mocked(fs.promises.symlink).mockRejectedValue(
            new Error('Link failed'),
        );
        vi.mocked(fs.promises.rm).mockRejectedValueOnce(
            new Error('Cleanup interrupted'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Cleanup interrupted');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        const remaining = entries.get(target);
        if (remaining?.kind !== 'directory')
            throw new Error('Expected retained copy');
        remaining.files = [];
        expect(await service.recover()).toMatchObject({ status: 'error' });
        expect(entries.has(target)).toBe(false);
        expect(journal).toBeUndefined();
    });

    it('restores the original and removes uncommitted copies if a link cannot be created', async () => {
        vi.mocked(fs.promises.symlink).mockRejectedValue(
            new Error('exportTemplates:errors.connection'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('exportTemplates:errors.connection');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(entries.has(target)).toBe(false);
        expect(library.builds).toEqual([]);
        expect(journal).toBeUndefined();
        expect(saved.exportTemplateBuilds).toBeUndefined();
    });
    it('rolls back a project write that committed before reporting failure', async () => {
        update.mockImplementationOnce(
            async (
                change: (projects: ProjectDetails[]) => ProjectDetails[],
            ) => {
                [saved] = change([saved]);
                throw new Error('Store reported failure');
            },
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Store reported failure');
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'directory',
            files: files('0'),
        });
        expect(saved.exportTemplateBuilds).toEqual({});
        expect(saved.exportTemplateMode).toBeUndefined();
        expect(journal).toBeUndefined();
    });
    it('finishes a committed ownership write even if the write reports an error', async () => {
        vi.mocked(writeTemplateVersionLayout).mockImplementationOnce(
            async (_editor, next) => {
                layout = next && structuredClone(next);
                throw new Error('Reported after commit');
            },
        );
        const result = await service.execute(
            source(),
            plan('save-imported'),
            saved,
            vi.fn(),
        );
        expect(result.exportTemplateBuilds?.[ids[0]]).toBe(build.id);
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'link',
            target,
        });
        expect(journal).toBeUndefined();
    });
    it('resumes interrupted committed cleanup without touching other local versions', async () => {
        acrossDrives();
        vi.mocked(fs.promises.rm).mockRejectedValue(
            new Error('Cleanup interrupted'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow('Cleanup interrupted');
        const pending = journal as unknown as TemplateVersionMigration;
        const backup = path.join(
            editor,
            'editor_data',
            'launcher_export_templates',
            'version-backups',
            pending.id,
            ids[0],
        );
        const remainder = entries.get(backup);
        if (remainder?.kind === 'directory') remainder.files = [];
        vi.mocked(fs.promises.rm).mockImplementation(async (filename) => {
            entries.delete(String(filename));
        });
        const restarted = new TemplateVersionMigrationService(
            { list, update } as unknown as ProjectsStore,
            createBuild,
        );
        expect(await restarted.recover()).toEqual({
            projectPath: project.path,
            setId: ids[0],
            status: 'complete',
        });
        expect(entries.get(path.join(local, ids[0]))).toEqual({
            kind: 'link',
            target,
        });
        expect(entries.get(path.join(local, ids[3]))).toEqual({
            kind: 'directory',
            files: files('3'),
        });
        expect(entries.has(backup)).toBe(false);
        expect(journal).toBeUndefined();
    });
    it('preserves the backup and journal when the committed link has been redirected', async () => {
        acrossDrives();
        vi.mocked(fs.promises.rm).mockRejectedValue(
            new Error('Cleanup interrupted'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow();
        entries.set(path.join(local, ids[0]), {
            kind: 'link',
            target: path.resolve('foreign'),
        });
        vi.mocked(fs.promises.rm).mockClear();
        await expect(service.recover()).rejects.toThrow(
            'exportTemplates:errors.connection',
        );
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(journal).toBeDefined();
    });
    it('refuses a redirected backup parent even when interrupted cleanup removed the backup', async () => {
        acrossDrives();
        vi.mocked(fs.promises.rm).mockRejectedValue(
            new Error('Cleanup interrupted'),
        );
        await expect(
            service.execute(source(), plan('save-imported'), saved, vi.fn()),
        ).rejects.toThrow();
        const pending = journal as unknown as TemplateVersionMigration;
        const parent = path.join(
            editor,
            'editor_data',
            'launcher_export_templates',
            'version-backups',
        );
        entries.delete(path.join(parent, pending.id, ids[0]));
        entries.set(parent, { kind: 'link', target: path.resolve('foreign') });
        vi.mocked(fs.promises.rmdir).mockClear();
        await expect(service.recover()).rejects.toThrow(
            'exportTemplates:errors.recovery',
        );
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
        expect(journal).toBeDefined();
    });
});
