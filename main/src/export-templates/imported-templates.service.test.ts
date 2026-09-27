import * as fs from 'node:fs';
import path from 'node:path';
import type {
    ImportedTemplateLibrary,
    ProjectDetails,
} from '@shared/contracts';
import { dialog } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsStore } from '../projects/projects.store.js';
import {
    type SwitchJournal,
    switchJournalSchema,
} from './imported-template-switch.schema.js';
import { ImportedTemplatesService } from './imported-templates.service.js';
import {
    readImportedTemplates,
    writeImportedTemplates,
} from './imported-templates.store.js';
import {
    clearSavedProjectMigration,
    readSavedProjectMigration,
    type SavedProjectMigration,
    writeSavedProjectMigration,
} from './saved-project-migration.store.js';
import type { TemplateArchiveAdapter } from './template-archive.adapter.js';
import { assertTemplateEditorsClosed } from './template-editor-running.util.js';
import {
    checkTemplateCapacity,
    readTemplateTree,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';
import { projectTemplateBuilds } from './template-projection.util.js';

// The service requests file names rather than directory-entry objects.
const readDirectory = vi.mocked<(directory: fs.PathLike) => Promise<string[]>>(
    fs.promises.readdir,
);

const layoutRecords = vi.hoisted(() => new Map<string, string>());
const switchRecording = vi.hoisted(() => ({ enabled: false }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));
vi.mock('./imported-template-switch.schema.js', () => ({
    switchJournalSchema: { parse: vi.fn() },
}));
vi.mock('../json-store/atomic-json-file.adapter.js', () => ({
    AtomicJsonFileAdapter: class {
        read = vi.fn(async (filename: string) => layoutRecords.get(filename));
        write = vi.fn(async (filename: string, value: string) => {
            if (
                switchRecording.enabled &&
                filename.endsWith('imported-template-switch.json')
            )
                layoutRecords.set(filename, value);
        });
    },
}));
vi.mock('node:fs', () => ({
    promises: {
        readdir: vi.fn(),
        rm: vi.fn(),
        mkdir: vi.fn(),
        stat: vi.fn(),
        copyFile: vi.fn(),
        cp: vi.fn(),
        open: vi.fn(),
        rename: vi.fn(),
        rmdir: vi.fn(),
        readlink: vi.fn(),
        lstat: vi.fn(),
    },
}));
vi.mock('./template-runtime.util.js', () => ({
    getSharedTemplateRoot: () => path.resolve('shared'),
}));
vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: () => path.resolve('dedicated'),
    projectTemplateStorage: (editorDirectory: string) =>
        path.join(editorDirectory, 'editor_data', 'launcher_export_templates'),
}));
vi.mock('./saved-project-migration.store.js', () => ({
    readSavedProjectMigration: vi.fn(),
    writeSavedProjectMigration: vi.fn(),
    clearSavedProjectMigration: vi.fn(),
}));
vi.mock('./template-editor-running.util.js', () => ({
    assertTemplateEditorsClosed: vi.fn(),
}));
vi.mock('./template-projection.util.js', () => ({
    projectTemplateBuilds: vi.fn(),
}));
vi.mock('./imported-templates.store.js', () => ({
    readImportedTemplates: vi.fn(),
    writeImportedTemplates: vi.fn(),
    importedTemplateRoot: () => path.resolve('imports'),
    importedTemplateFiles: (build: { setId: string; directoryName: string }) =>
        path.resolve('imports', 'imported', build.setId, build.directoryName),
    importedTemplateDirectoryName: (label: string) => label,
    resolveImportedTemplate: (
        current: ImportedTemplateLibrary,
        setId: string,
        selection: string = 'official',
    ) => {
        if (selection === 'official') return undefined;
        const build = current.builds.find(
            (item) => item.id === selection && item.setId === setId,
        );
        if (!build) throw new Error('exportTemplates:library.missing');
        return build;
    },
}));
vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: vi.fn(),
}));
const first = {
    id: 'one',
    revision: 'revision-one',
    directoryName: 'Encrypted',
    label: 'Encrypted',
    setId: '4.4.stable',
    files: ['web.zip'],
    sizeBytes: 1,
    importedAt: '',
    archiveName: '',
};
const second = {
    ...first,
    id: 'two',
    revision: 'revision-two',
    directoryName: 'Steam',
    label: 'Steam',
};

/** Builds the review snapshot for one saved reference in these tests.
 * @param project - Project selected in the deletion review.
 */
function reviewedReference(project: ProjectDetails) {
    const currentSetId = `${project.release.version.replace('-', '.')}${project.release.mono ? '.mono' : ''}`;
    return {
        projectPath: project.path,
        currentSetId,
        active:
            !!project.launch_path &&
            project.release.source !== 'custom' &&
            currentSetId === '4.4.stable' &&
            project.exportTemplateBuilds?.['4.4.stable'] === 'one',
    };
}
let projects: ProjectDetails[];
let library: ImportedTemplateLibrary;
let migration: SavedProjectMigration | undefined;
let service: ImportedTemplatesService;
let importedDirectories: Set<string>;
const update = vi.fn();
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(switchJournalSchema.parse).mockImplementation(
        (value) => value as SwitchJournal,
    );
    layoutRecords.clear();
    switchRecording.enabled = false;
    projects = [
        {
            name: 'Game',
            path: path.resolve('game'),
            launch_path: path.resolve('editor', 'Godot'),
            release: { version: '4.4-stable', source: 'official', mono: false },
            exportTemplateMode: 'separate',
        } as ProjectDetails,
    ];
    library = {
        schemaVersion: 1,
        builds: [structuredClone(first), structuredClone(second)],
    };
    importedDirectories = new Set([
        path.resolve('imports', 'imported', first.setId, first.directoryName),
        path.resolve('imports', 'imported', second.setId, second.directoryName),
    ]);
    migration = undefined;
    vi.mocked(readSavedProjectMigration).mockImplementation(
        async () => migration,
    );
    vi.mocked(writeSavedProjectMigration).mockImplementation(async (next) => {
        migration = structuredClone(next);
    });
    vi.mocked(clearSavedProjectMigration).mockImplementation(async () => {
        migration = undefined;
    });
    vi.mocked(fs.promises.rm).mockImplementation(async (target) => {
        importedDirectories.delete(String(target));
        layoutRecords.delete(String(target));
    });
    vi.mocked(fs.promises.cp).mockImplementation(async (_source, target) => {
        importedDirectories.add(String(target));
    });
    vi.mocked(fs.promises.rename).mockImplementation(async (source, target) => {
        importedDirectories.delete(String(source));
        importedDirectories.add(String(target));
    });
    vi.mocked(fs.promises.rmdir).mockResolvedValue(undefined);
    vi.mocked(readTemplateTree).mockResolvedValue([
        { relative: 'web.zip', size: 1, hash: '', mode: 0o644 },
    ]);
    vi.mocked(templateLstat).mockImplementation(async (filename) =>
        !String(filename).startsWith(path.resolve('imports')) ||
        importedDirectories.has(String(filename))
            ? ({
                  isDirectory: () => true,
                  isSymbolicLink: () => false,
              } as fs.Stats)
            : undefined,
    );
    vi.mocked(readImportedTemplates).mockImplementation(async () =>
        structuredClone(library),
    );
    vi.mocked(writeImportedTemplates).mockImplementation(async (next) => {
        library = structuredClone(next);
    });
    readDirectory.mockResolvedValue([]);
    update.mockImplementation(async (mutate) => {
        projects = await mutate(projects);
        return projects;
    });
    service = new ImportedTemplatesService(
        { list: async () => projects, update } as unknown as ProjectsStore,
        {} as TemplateArchiveAdapter,
    );
});
describe('central imported library', () => {
    it('restores an Official current editor without reading an unavailable imported registry', async () => {
        projects[0].exportTemplateBuilds = {
            '4.4.stable': 'official',
            '4.3.stable': 'one',
        };
        await service.synchronise(undefined, [projects[0]]);
        expect(readImportedTemplates).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledWith(
            path.dirname(projects[0].launch_path as string),
            path.resolve('shared'),
            { schemaVersion: 1, builds: [] },
            projects[0].exportTemplateBuilds,
            '4.4.stable',
        );
    });
    it('reads the selected archive directly and rejects a source changed during extraction', async () => {
        const sourcePath = path.resolve('downloads', 'templates.tpz');
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [sourcePath],
        });
        const source = {
            isFile: () => true,
            size: 100,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats;
        vi.mocked(fs.promises.stat)
            .mockResolvedValueOnce(source)
            .mockResolvedValueOnce({ ...source, mtimeMs: 2 });
        const extract = vi.fn<TemplateArchiveAdapter['extract']>();
        service = new ImportedTemplatesService(
            { list: async () => projects } as unknown as ProjectsStore,
            { extract } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected file selection');
        extract.mockImplementation(
            async (archive, _destination, _signal, onProgress) => {
                expect(archive).toBe(sourcePath);
                onProgress?.(50, 100);
                expect(service.getProgress(selected.token)).toEqual({
                    completedBytes: 50,
                    totalBytes: 100,
                });
                return {
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                };
            },
        );
        await expect(service.prepare(selected.token)).rejects.toThrow(
            'errors.changed',
        );
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.join(path.resolve('imports'), '.staging', selected.token),
            { recursive: true, force: true },
        );
        expect(service.getProgress(selected.token)).toBeNull();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });

    it('selects a file without reading the archive or the library', async () => {
        const sourcePath = path.resolve('downloads', 'encrypted.tpz');
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [sourcePath],
        });
        const selected = await service.choose();
        expect(selected).toEqual({
            token: expect.any(String),
            sourcePath,
            archiveName: 'encrypted.tpz',
        });
        expect(readImportedTemplates).not.toHaveBeenCalled();
        expect(fs.promises.readdir).not.toHaveBeenCalled();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it('invalidates a removed selection before any processing can start', async () => {
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('encrypted.tpz')],
        });
        const selected = await service.choose();
        if (!selected) throw new Error('Expected file selection');
        await service.discard(selected.token);
        await expect(service.prepare(selected.token)).rejects.toThrow(
            'errors.changed',
        );
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('keeps a cancelled file picker free of temporary work', async () => {
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: true,
            filePaths: [],
        });
        await expect(service.choose()).resolves.toBeNull();
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(readImportedTemplates).not.toHaveBeenCalled();
    });
    it('aborts an in-flight extraction and waits for staging cleanup before discard returns', async () => {
        const sourcePath = path.resolve('downloads', 'templates.tpz');
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [sourcePath],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
        } as fs.Stats);
        let entered!: () => void;
        let release!: () => void;
        const extracting = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const finish = new Promise<void>((resolve) => {
            release = resolve;
        });
        let signal: AbortSignal | undefined;
        service = new ImportedTemplatesService(
            { list: async () => projects } as unknown as ProjectsStore,
            {
                extract: vi.fn(
                    async (_archive, _destination, currentSignal) => {
                        signal = currentSignal;
                        entered();
                        await finish;
                        currentSignal.throwIfAborted();
                        return {
                            identity: '4.4.stable',
                            contents: path.resolve('extracted'),
                        };
                    },
                ),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected file selection');
        const preparing = service.prepare(selected.token);
        await extracting;
        await expect(service.prepare(selected.token)).rejects.toThrow(
            'errors.busy',
        );
        await expect(service.install(selected.token, 'Busy')).rejects.toThrow(
            'errors.busy',
        );
        const discarding = service.discard(selected.token);
        expect(signal?.aborted).toBe(true);
        let discarded = false;
        void discarding.then(() => {
            discarded = true;
        });
        await Promise.resolve();
        expect(discarded).toBe(false);
        release();
        await expect(preparing).rejects.toThrow('errors.changed');
        await discarding;
        expect(discarded).toBe(true);
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.join(path.resolve('imports'), '.staging', selected.token),
            { recursive: true, force: true },
        );
        await expect(service.prepare(selected.token)).rejects.toThrow(
            'errors.changed',
        );
    });
    it('does not discard staging while installation is using its preview', async () => {
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('templates.tpz')],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
            size: 1,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'web.zip', size: 1, hash: 'web', mode: 0o644 },
        ]);
        service = new ImportedTemplatesService(
            { list: async () => projects, update } as unknown as ProjectsStore,
            {
                extract: vi.fn(async () => ({
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                })),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected file selection');
        await service.prepare(selected.token);
        let entered!: () => void;
        let release!: () => void;
        const reading = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const finish = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.mocked(readImportedTemplates).mockImplementationOnce(async () => {
            entered();
            await finish;
            return structuredClone(library);
        });
        const installing = service.install(selected.token, 'New import');
        await reading;
        await expect(service.discard(selected.token)).rejects.toThrow(
            'errors.busy',
        );
        release();
        await expect(installing).resolves.toEqual(expect.any(String));
        expect(library.builds).toHaveLength(3);
    });
    it('removes abandoned preview and incoming directories while keeping live and backup paths', async () => {
        const staging = path.resolve('imports', '.staging');
        const orphan = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const orphanPath = path.join(staging, orphan);
        const incoming = path.join(
            staging,
            'incoming-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        );
        const backup = path.join(
            staging,
            'backup-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        );
        importedDirectories.add(staging);
        importedDirectories.add(orphanPath);
        importedDirectories.add(incoming);
        importedDirectories.add(backup);
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('live.tpz')],
        });
        const live = await service.choose();
        if (!live) throw new Error('Expected file selection');
        const livePath = path.join(staging, live.token);
        importedDirectories.add(livePath);
        readDirectory.mockResolvedValue([
            orphan,
            live.token,
            path.basename(incoming),
            path.basename(backup),
            'imported-template-switch.json',
        ]);

        await service.cleanupAbandonedPreviews();

        expect(fs.promises.rm).toHaveBeenCalledWith(orphanPath, {
            recursive: true,
        });
        expect(fs.promises.rm).toHaveBeenCalledWith(incoming, {
            recursive: true,
        });
        expect(importedDirectories.has(livePath)).toBe(true);
        expect(importedDirectories.has(incoming)).toBe(false);
        expect(importedDirectories.has(backup)).toBe(true);
    });
    it('keeps an incoming directory while a switch journal exists', async () => {
        const staging = path.resolve('imports', '.staging');
        const incoming = path.join(
            staging,
            'incoming-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        );
        importedDirectories.add(staging);
        importedDirectories.add(incoming);
        layoutRecords.set(
            path.resolve('imports', 'imported-template-switch.json'),
            '{}',
        );
        readDirectory.mockResolvedValue([path.basename(incoming)]);

        await service.cleanupAbandonedPreviews();

        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(importedDirectories.has(incoming)).toBe(true);
    });
    it('leaves imports unused until a project explicitly selects them', async () => {
        expect((await service.inventory()).usage.one).toEqual([]);
    });
    it('does not count an explicit Official project as an import user', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'official' };
        expect((await service.inventory()).usage.one).toEqual([]);
    });
    it('does not hide a corrupt imported registry behind an empty inventory', async () => {
        vi.mocked(readImportedTemplates).mockRejectedValueOnce(
            new Error('corrupt registry'),
        );
        await expect(service.inventory()).rejects.toThrow('corrupt registry');
    });
    it('marks one unreadable build unavailable while keeping unrelated entries usable', async () => {
        vi.mocked(readTemplateTree).mockImplementation(async (directory) => {
            if (
                directory ===
                path.resolve(
                    'imports',
                    'imported',
                    second.setId,
                    second.directoryName,
                )
            )
                throw new Error('unreadable file');
            return [{ relative: 'web.zip', size: 1, hash: '', mode: 0o644 }];
        });
        const inventory = await service.inventory();
        expect(
            inventory.builds.find((build) => build.id === 'one')?.available,
        ).toBe(true);
        expect(
            inventory.builds.find((build) => build.id === 'two')?.available,
        ).toBe(false);
        await service.remove('one');
        expect(library.builds.map((build) => build.id)).toEqual(['two']);
    });
    it('reports remembered choices without calling them current usage', async () => {
        projects[0].release.version = '4.7.2-stable';
        projects[0].exportTemplateBuilds = {
            '4.4.stable': 'one',
            '4.7.2.stable': 'official',
        };
        const inventory = await service.inventory();
        expect(inventory.usage.one).toEqual([]);
        expect(inventory.references.one).toEqual([
            {
                projectPath: projects[0].path,
                projectName: 'Game',
                currentSetId: '4.7.2.stable',
                active: false,
            },
        ]);
    });
    it('counts same-name projects separately when each currently uses the build', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        projects.push({ ...projects[0], path: path.resolve('second-game') });
        const inventory = await service.inventory();
        expect(inventory.usage.one).toEqual(['Game', 'Game']);
        expect(
            inventory.references.one.map((reference) => reference.projectPath),
        ).toEqual([projects[0].path, projects[1].path]);
    });
    it('refuses deletion of a referenced build without touching storage', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        await expect(service.remove('one')).rejects.toThrow('library.inUse');
        expect(writeImportedTemplates).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('allows deleting an unused import even when alternatives exist', async () => {
        await service.remove('one');
        expect(library.builds.map((build) => build.id)).toEqual(['two']);
    });
    it.each(['custom', 'unavailable'])(
        'protects a remembered import for a %s editor',
        async (kind) => {
            projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
            if (kind === 'custom') projects[0].release.source = 'custom';
            else projects[0].launch_path = '';
            const inventory = await service.inventory();
            expect(inventory.usage.one).toEqual([]);
            expect(inventory.references.one[0].active).toBe(false);
            await expect(service.remove('one')).rejects.toThrow(
                'library.inUse',
            );
            expect(fs.promises.rm).not.toHaveBeenCalled();
        },
    );
    it('removes only an unused library entry', async () => {
        await service.remove('two');
        expect(library.builds.map((build) => build.id)).toEqual(['one']);
        expect(fs.promises.rm).toHaveBeenCalledTimes(1);
    });
    it('switches a remembered choice to Official without touching the current link', async () => {
        projects[0].release.version = '4.7.2-stable';
        projects[0].exportTemplateBuilds = {
            '4.4.stable': 'one',
            '4.7.2.stable': 'official',
        };
        await service.remove('one', {
            replacement: 'official',
            revision: first.revision,
            references: [reviewedReference(projects[0])],
        });
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'official',
            '4.7.2.stable': 'official',
        });
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        expect(library.builds.map((build) => build.id)).toEqual(['two']);
    });
    it.each(['custom', 'unavailable'])(
        'updates a remembered choice for a %s editor without changing links',
        async (kind) => {
            projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
            if (kind === 'custom') projects[0].release.source = 'custom';
            else projects[0].launch_path = '';
            await service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            });
            expect(projects[0].exportTemplateBuilds).toEqual({
                '4.4.stable': 'official',
            });
            expect(projectTemplateBuilds).not.toHaveBeenCalled();
            expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        },
    );
    it('switches an active project to a matching import before deleting the old build', async () => {
        projects[0].exportTemplateBuilds = {
            '4.4.stable': 'one',
            '4.3.stable': 'official',
        };
        const unrelated = {
            ...projects[0],
            path: path.resolve('other'),
            exportTemplateBuilds: { '4.4.stable': 'two' },
        };
        projects.push(unrelated);
        vi.mocked(writeImportedTemplates).mockImplementation(async (next) => {
            expect(projectTemplateBuilds).toHaveBeenCalledWith(
                path.resolve('editor'),
                path.resolve('shared'),
                expect.objectContaining({
                    builds: expect.arrayContaining([first]),
                }),
                expect.objectContaining({ '4.4.stable': 'two' }),
                '4.4.stable',
            );
            library = structuredClone(next);
        });
        await service.remove('one', {
            replacement: 'two',
            revision: first.revision,
            references: [reviewedReference(projects[0])],
        });
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'two',
            '4.3.stable': 'official',
        });
        expect(projects[1].exportTemplateBuilds).toEqual({
            '4.4.stable': 'two',
        });
        expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        expect(library.builds.map((build) => build.id)).toEqual(['two']);
    });
    it('rejects stale revision and reference reviews without mutating projects', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        for (const options of [
            {
                replacement: 'official',
                revision: 'stale',
                references: [reviewedReference(projects[0])],
            },
            {
                replacement: 'official',
                revision: first.revision,
                references: [],
            },
            {
                replacement: 'official',
                revision: first.revision,
                references: [
                    reviewedReference(projects[0]),
                    reviewedReference(projects[0]),
                ],
            },
        ])
            await expect(service.remove('one', options)).rejects.toThrow(
                'errors.changed',
            );
        expect(update).not.toHaveBeenCalled();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it('rejects a review when the project changed its current editor or active state', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        const reviewed = reviewedReference(projects[0]);
        projects[0].release.version = '4.7.2-stable';
        await expect(
            service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewed],
            }),
        ).rejects.toThrow('errors.changed');
        projects[0].release.version = '4.4-stable';
        projects[0].release.source = 'custom';
        await expect(
            service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewed],
            }),
        ).rejects.toThrow('errors.changed');
        expect(update).not.toHaveBeenCalled();
    });
    it('does not touch links when a concurrent project update prevents the switch', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        update.mockRejectedValueOnce(new Error('project changed'));
        await expect(
            service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            }),
        ).rejects.toThrow('project changed');
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'one',
        });
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(library.builds.map((build) => build.id)).toEqual(['one', 'two']);
    });
    it('rejects an incompatible or unavailable replacement before changing choices', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        library.builds[1].setId = '4.4.stable.mono';
        const reviewed = {
            revision: first.revision,
            references: [reviewedReference(projects[0])],
        };
        await expect(
            service.remove('one', { ...reviewed, replacement: 'two' }),
        ).rejects.toThrow('library.incompatible');
        await expect(
            service.remove('one', { ...reviewed, replacement: 'missing' }),
        ).rejects.toThrow('library.missing');
        library.builds[1].setId = '4.4.stable';
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename ===
            path.resolve(
                'imports',
                'imported',
                second.setId,
                second.directoryName,
            )
                ? undefined
                : ({
                      isDirectory: () => true,
                      isSymbolicLink: () => false,
                  } as fs.Stats),
        );
        await expect(
            service.remove('one', { ...reviewed, replacement: 'two' }),
        ).rejects.toThrow('library.missing');
        expect(update).not.toHaveBeenCalled();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it('marks a partial build unavailable and refuses it as a replacement', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory ===
            path.resolve(
                'imports',
                'imported',
                second.setId,
                second.directoryName,
            )
                ? []
                : [{ relative: 'web.zip', size: 1, hash: '', mode: 0o644 }],
        );
        const inventory = await service.inventory();
        expect(
            inventory.builds.find((build) => build.id === 'one')?.available,
        ).toBe(true);
        expect(
            inventory.builds.find((build) => build.id === 'two')?.available,
        ).toBe(false);
        await expect(
            service.remove('one', {
                replacement: 'two',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            }),
        ).rejects.toThrow('library.missing');
        expect(update).not.toHaveBeenCalled();
    });
    it('rejects an unreadable replacement without exposing a filesystem error', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(readTemplateTree).mockRejectedValueOnce(
            new Error('private path unreadable'),
        );
        await expect(
            service.remove('one', {
                replacement: 'two',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            }),
        ).rejects.toThrow('library.missing');
        expect(update).not.toHaveBeenCalled();
    });
    it('does not offer a build that records no package files', async () => {
        library.builds[1].files = [];
        const inventory = await service.inventory();
        expect(
            inventory.builds.find((build) => build.id === 'two')?.available,
        ).toBe(false);
    });
    it('restores saved choices and active links when switching fails', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(projectTemplateBuilds).mockRejectedValueOnce(
            new Error('link failed'),
        );
        await expect(
            service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            }),
        ).rejects.toThrow('link failed');
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'one',
        });
        expect(projectTemplateBuilds).toHaveBeenCalledTimes(2);
        expect(library.builds.map((build) => build.id)).toEqual(['one', 'two']);
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('preserves old files and references if registry removal fails', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(writeImportedTemplates).mockRejectedValueOnce(
            new Error('registry failed'),
        );
        await expect(
            service.remove('one', {
                replacement: 'official',
                revision: first.revision,
                references: [reviewedReference(projects[0])],
            }),
        ).rejects.toThrow('registry failed');
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'one',
        });
        expect(projectTemplateBuilds).toHaveBeenCalledTimes(2);
        expect(library.builds.map((build) => build.id)).toEqual(['one', 'two']);
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('keeps switched choices when the registry commit succeeded before an error', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(writeImportedTemplates).mockImplementationOnce(
            async (next) => {
                library = structuredClone(next);
                throw new Error('response lost');
            },
        );
        await service.remove('one', {
            replacement: 'official',
            revision: first.revision,
            references: [reviewedReference(projects[0])],
        });
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'official',
        });
        expect(library.builds.map((build) => build.id)).toEqual(['two']);
        expect(fs.promises.rm).toHaveBeenCalledOnce();
    });
    it('preserves choices for other versions when one selection changes', async () => {
        projects[0].exportTemplateBuilds = { '4.3.stable': 'official' };
        await service.select(projects[0].path, { '4.4.stable': 'two' });
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.3.stable': 'official',
            '4.4.stable': 'two',
        });
        expect(projects[0].exportTemplateMode).toBe('separate');
    });
    it('rejects a selected build with missing recorded files before saving choices', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(readTemplateTree).mockResolvedValue([]);

        await expect(
            service.select(projects[0].path, { '4.4.stable': 'two' }),
        ).rejects.toThrow('exportTemplates:library.missing');

        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'one',
        });
        expect(update).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(readTemplateTree).toHaveBeenCalledWith(
            path.resolve(
                'imports',
                'imported',
                second.setId,
                second.directoryName,
            ),
            false,
        );
    });
    it('reports an unreadable selected build as missing before saving choices', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(readTemplateTree).mockRejectedValue(
            new Error('package read failed'),
        );

        await expect(
            service.select(projects[0].path, { '4.4.stable': 'two' }),
        ).rejects.toThrow('exportTemplates:library.missing');

        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'one',
        });
        expect(update).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(readTemplateTree).toHaveBeenCalledWith(
            path.resolve(
                'imports',
                'imported',
                second.setId,
                second.directoryName,
            ),
            false,
        );
    });
    it('rejects an imported build from the wrong edition before saving', async () => {
        await expect(
            service.select(projects[0].path, { '4.4.stable.mono': 'one' }),
        ).rejects.toThrow('library.missing');
        expect(update).not.toHaveBeenCalled();
    });
    it('restores the saved selection if the connection cannot change', async () => {
        vi.mocked(projectTemplateBuilds).mockRejectedValueOnce(
            new Error('link failed'),
        );
        await expect(
            service.select(projects[0].path, { '4.4.stable': 'two' }),
        ).rejects.toThrow('link failed');
        expect(projects[0].exportTemplateBuilds).toBeUndefined();
    });
    it('keeps originals until imported copies and project selections are durable', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        readDirectory.mockResolvedValue(['4.4.stable'] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'web.zip', size: 1, hash: 'bytes', mode: 0o644 },
        ]);
        vi.mocked(fs.promises.rm).mockImplementation(async (target) => {
            if (target === path.join(local, '4.4.stable')) {
                expect(projects[0].exportTemplateBuilds?.['4.4.stable']).toBe(
                    library.builds[2].id,
                );
                expect(migration).toBeDefined();
            }
        });
        await service.saveProject(projects[0], local);
        expect(fs.promises.cp).toHaveBeenCalledOnce();
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(checkTemplateCapacity).toHaveBeenCalledOnce();
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.join(local, '4.4.stable'),
            { recursive: true },
        );
        expect(projects[0].exportTemplateMode).toBe('shared');
        expect(migration).toBeUndefined();
    });
    it('gives a migrated project build a distinct tag when its name is in use', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        library.builds[0] = { ...library.builds[0], label: projects[0].name };
        readDirectory.mockResolvedValue(['4.4.stable'] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'web.zip', size: 1, hash: 'bytes', mode: 0o644 },
        ]);
        await service.saveProject(projects[0], local);
        expect(library.builds[2].label).toBe('Game (2)');
    });
    it('preserves the original and rolls back metadata when a copy differs', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        readDirectory.mockResolvedValue(['4.4.stable'] as never);
        vi.mocked(readTemplateTree)
            .mockResolvedValueOnce([
                { relative: 'web.zip', size: 1, hash: 'old', mode: 0o644 },
            ])
            .mockResolvedValueOnce([
                { relative: 'web.zip', size: 1, hash: 'new', mode: 0o644 },
            ]);
        await expect(service.saveProject(projects[0], local)).rejects.toThrow(
            'errors.changed',
        );
        expect(library.builds).toEqual([first, second]);
        expect(update).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalledWith(
            path.join(local, '4.4.stable'),
            expect.anything(),
        );
    });
    it('rolls back an uncommitted project update without removing the original', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        readDirectory.mockResolvedValue(['4.4.stable'] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'web.zip', size: 1, hash: 'bytes', mode: 0o644 },
        ]);
        update.mockRejectedValueOnce(new Error('store failed'));
        await expect(service.saveProject(projects[0], local)).rejects.toThrow(
            'store failed',
        );
        expect(library.builds).toEqual([first, second]);
        expect(fs.promises.rm).not.toHaveBeenCalledWith(
            path.join(local, '4.4.stable'),
            expect.anything(),
        );
        expect(migration).toBeUndefined();
    });
    it('finishes source cleanup after a project selection was committed before interruption', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        const files = [
            { relative: 'web.zip', size: 1, hash: 'bytes', mode: 0o644 },
        ];
        const fingerprint = templateFingerprint(files);
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint }],
        };
        library.builds.push(build);
        projects[0].exportTemplateMode = 'shared';
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        vi.mocked(readTemplateTree).mockResolvedValue(files);
        vi.mocked(fs.promises.rm).mockImplementation(async () => {
            expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        });
        await service.recoverSavedProjects();
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.join(local, build.setId),
            { recursive: true },
        );
        expect(library.builds).toContainEqual(build);
        expect(migration).toBeUndefined();
    });
    it('resumes a partially deleted source when every surviving file matches the imported copy', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        const complete = [
            { relative: 'web.zip', size: 1, hash: 'web', mode: 0o644 },
            { relative: 'linux.zip', size: 1, hash: 'linux', mode: 0o644 },
        ];
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint: templateFingerprint(complete) }],
        };
        library.builds.push(build);
        projects[0].exportTemplateMode = 'shared';
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        vi.mocked(readTemplateTree).mockImplementation(async (root) =>
            root === path.join(local, build.setId) ? [complete[0]] : complete,
        );
        await service.recoverSavedProjects();
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.join(local, build.setId),
            { recursive: true },
        );
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        expect(migration).toBeUndefined();
    });
    it('preserves a changed surviving file and leaves the journal for inspection', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        const complete = [
            { relative: 'web.zip', size: 1, hash: 'web', mode: 0o644 },
        ];
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint: templateFingerprint(complete) }],
        };
        library.builds.push(build);
        projects[0].exportTemplateMode = 'shared';
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        vi.mocked(readTemplateTree).mockImplementation(async (root) =>
            root === path.join(local, build.setId)
                ? [{ ...complete[0], hash: 'changed' }]
                : complete,
        );
        await expect(service.recoverSavedProjects()).rejects.toThrow(
            'errors.changed',
        );
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(migration).toBeDefined();
    });
    it('does not traverse a projected imported view after cleanup but restores its link', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        const complete = [
            { relative: 'web.zip', size: 1, hash: 'web', mode: 0o644 },
        ];
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint: templateFingerprint(complete) }],
        };
        library.builds.push(build);
        projects[0].exportTemplateMode = 'shared';
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        readDirectory.mockResolvedValue(['4.4.stable'] as never);
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === path.join(local, build.setId)
                ? ({
                      isDirectory: () => false,
                      isSymbolicLink: () => true,
                  } as fs.Stats)
                : ({
                      isDirectory: () => true,
                      isSymbolicLink: () => false,
                  } as fs.Stats),
        );
        vi.mocked(readTemplateTree).mockResolvedValue(complete);
        await service.recoverSavedProjects();
        expect(readTemplateTree).toHaveBeenCalledOnce();
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        expect(migration).toBeUndefined();
    });
    it('leaves a recreated shared link in place while clearing completed recovery', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        const complete = [
            { relative: 'web.zip', size: 1, hash: 'web', mode: 0o644 },
        ];
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint: templateFingerprint(complete) }],
        };
        library.builds.push(build);
        projects[0].exportTemplateMode = 'shared';
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === local
                ? ({
                      isDirectory: () => false,
                      isSymbolicLink: () => true,
                  } as fs.Stats)
                : ({
                      isDirectory: () => true,
                      isSymbolicLink: () => false,
                  } as fs.Stats),
        );
        vi.mocked(fs.promises.readlink).mockResolvedValue(
            path.resolve('shared'),
        );
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isSymbolicLink: () => true,
        } as fs.Stats);
        vi.mocked(readTemplateTree).mockResolvedValue(complete);
        await service.recoverSavedProjects();
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(fs.promises.rmdir).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        expect(migration).toBeUndefined();
    });
    it('removes uncommitted imported copies while leaving local templates in place', async () => {
        const local = path.resolve('editor', 'editor_data', 'export_templates');
        const build = { ...first, id: 'saved', revision: 'saved-revision' };
        migration = {
            version: 1,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            localPath: local,
            builds: [{ build, fingerprint: 'a'.repeat(64) }],
        };
        library.builds.push(build);
        vi.mocked(templateLstat).mockResolvedValue({
            isDirectory: () => true,
            isSymbolicLink: () => false,
        } as fs.Stats);
        await service.recoverSavedProjects();
        expect(library.builds).not.toContainEqual(build);
        expect(fs.promises.rm).toHaveBeenCalledWith(
            path.resolve(
                'imports',
                'imported',
                first.setId,
                first.directoryName,
            ),
            { recursive: true },
        );
        expect(fs.promises.rm).not.toHaveBeenCalledWith(
            path.join(local, build.setId),
            expect.anything(),
        );
        expect(migration).toBeUndefined();
    });
    it('imports a new package without changing or resolving unrelated missing project selections', async () => {
        projects[0].exportTemplateBuilds = { '4.4.stable': 'missing' };
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('new.tpz')],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
            size: 10,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'web.zip', size: 1, hash: '', mode: 0o644 },
        ]);
        service = new ImportedTemplatesService(
            { list: async () => projects, update } as unknown as ProjectsStore,
            {
                extract: vi.fn(async () => ({
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                })),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected selected archive');
        await service.prepare(selected.token);
        await service.install(selected.token, 'New import');
        expect(library.builds).toHaveLength(3);
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(projects[0].exportTemplateBuilds).toEqual({
            '4.4.stable': 'missing',
        });
    });
    it('keeps the selected name and folder when replacing a package', async () => {
        const existing = {
            ...first,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        };
        library.builds[0] = existing;
        switchRecording.enabled = true;
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('replacement.tpz')],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
            size: 10,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats);
        service = new ImportedTemplatesService(
            { list: async () => projects, update } as unknown as ProjectsStore,
            {
                extract: vi.fn(async () => ({
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                })),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected selected archive');
        await service.prepare(selected.token);

        await expect(
            service.install(selected.token, 'sTeAm', existing.id),
        ).resolves.toBe(existing.id);

        expect(library.builds).toHaveLength(2);
        expect(
            library.builds.find((build) => build.id === existing.id),
        ).toMatchObject({
            label: 'Encrypted',
            directoryName: 'Encrypted',
            setId: '4.4.stable',
        });
        expect(
            importedDirectories.has(
                path.resolve('imports', 'imported', '4.4.stable', 'Encrypted'),
            ),
        ).toBe(true);
        expect(
            importedDirectories.has(
                path.resolve('imports', 'imported', '4.4.stable', 'sTeAm'),
            ),
        ).toBe(false);
    });
    it('removes a partial incoming copy when replacement staging fails before journalling', async () => {
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('replacement.tpz')],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
            size: 10,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats);
        service = new ImportedTemplatesService(
            { list: async () => projects, update } as unknown as ProjectsStore,
            {
                extract: vi.fn(async () => ({
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                })),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected selected archive');
        await service.prepare(selected.token);
        vi.mocked(fs.promises.cp).mockImplementationOnce(
            async (_source, target) => {
                importedDirectories.add(String(target));
                throw new Error('copy interrupted');
            },
        );

        await expect(
            service.install(selected.token, '', first.id),
        ).rejects.toThrow('copy interrupted');

        const incoming = vi.mocked(fs.promises.cp).mock.calls[0]?.[1];
        expect(incoming).toBeDefined();
        expect(fs.promises.rm).toHaveBeenCalledWith(incoming, {
            recursive: true,
        });
        expect(importedDirectories.has(String(incoming))).toBe(false);
        expect(library.builds[0]).toEqual(first);
    });
    it('removes the verified incoming copy after rolling back a failed replacement', async () => {
        const build = {
            ...first,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        };
        library.builds[0] = build;
        const incomingRevision = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const incoming = path.resolve(
            'imports',
            '.staging',
            `incoming-${build.id}-${incomingRevision}`,
        );
        const backup = path.resolve(
            'imports',
            '.staging',
            `backup-${build.id}-${build.revision}`,
        );
        const before = path.resolve(
            'imports',
            'imported',
            build.setId,
            build.directoryName,
        );
        importedDirectories.add(path.dirname(incoming));
        importedDirectories.add(backup);
        const fingerprint = templateFingerprint(
            await readTemplateTree(before, true),
        );
        const journalPath = path.resolve(
            'imports',
            'imported-template-switch.json',
        );
        layoutRecords.set(
            journalPath,
            JSON.stringify({
                version: 1,
                kind: 'replace',
                id: build.id,
                setId: build.setId,
                beforeRevision: build.revision,
                afterRevision: incomingRevision,
                beforeDirectoryName: build.directoryName,
                afterDirectoryName: build.directoryName,
                beforeFingerprint: fingerprint,
                afterFingerprint: fingerprint,
            }),
        );
        switchRecording.enabled = true;

        await service.recoverSavedProjects();

        expect(importedDirectories.has(before)).toBe(true);
        expect(importedDirectories.has(backup)).toBe(false);
        expect(importedDirectories.has(incoming)).toBe(false);
        expect(fs.promises.rm).toHaveBeenCalledWith(incoming, {
            recursive: true,
        });
        expect(layoutRecords.has(journalPath)).toBe(false);
    });
    /** Models a committed replacement whose old backup survived interrupted removal.
     * @param remaining - Files currently left in the old backup.
     */
    function committedReplacementBackup(
        remaining: Array<{
            relative: string;
            size: number;
            hash: string;
            mode: number;
        }>,
    ) {
        const build = {
            ...first,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        };
        library.builds[0] = build;
        const backup = path.resolve(
            'imports',
            '.staging',
            `backup-${build.id}-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
        );
        importedDirectories.add(backup);
        const beforeFiles = [
            {
                relative: 'web.zip',
                size: 1,
                hash: 'a'.repeat(64),
                mode: 0o644,
            },
            {
                relative: 'linux.zip',
                size: 1,
                hash: 'b'.repeat(64),
                mode: 0o644,
            },
        ];
        const afterFiles = [
            {
                relative: 'web.zip',
                size: 1,
                hash: 'c'.repeat(64),
                mode: 0o644,
            },
        ];
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === backup ? remaining : afterFiles,
        );
        const journalPath = path.resolve(
            'imports',
            'imported-template-switch.json',
        );
        layoutRecords.set(
            journalPath,
            JSON.stringify({
                version: 1,
                kind: 'replace',
                id: build.id,
                setId: build.setId,
                beforeRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                afterRevision: build.revision,
                beforeDirectoryName: build.directoryName,
                afterDirectoryName: build.directoryName,
                beforeFingerprint: templateFingerprint(beforeFiles),
                afterFingerprint: templateFingerprint(afterFiles),
                beforeCleanupFiles: beforeFiles,
            }),
        );
        return { backup, journalPath, beforeFiles };
    }

    it('finishes a committed replacement after part of its old backup was removed', async () => {
        const original = {
            relative: 'web.zip',
            size: 1,
            hash: 'a'.repeat(64),
            mode: 0o644,
        };
        const { backup, journalPath } = committedReplacementBackup([original]);
        projects[0].exportTemplateBuilds = {
            '4.4.stable': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        };
        const unrelated = {
            ...projects[0],
            path: path.resolve('unrelated-game'),
            launch_path: path.resolve('unrelated-editor', 'Godot'),
            exportTemplateBuilds: { '4.4.stable': 'two' },
        };
        projects.push(unrelated);
        vi.mocked(projectTemplateBuilds).mockImplementation(async (editor) => {
            if (editor === path.dirname(unrelated.launch_path as string))
                throw new Error('unrelated local templates await migration');
        });

        await service.recoverSavedProjects();

        expect(fs.promises.rm).toHaveBeenCalledWith(backup, {
            recursive: true,
        });
        expect(layoutRecords.has(journalPath)).toBe(false);
        expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        expect(projectTemplateBuilds).toHaveBeenCalledWith(
            path.dirname(projects[0].launch_path as string),
            path.resolve('shared'),
            expect.anything(),
            projects[0].exportTemplateBuilds,
            '4.4.stable',
        );
    });

    it('accepts a complete old switch journal before deleting its unchanged backup', async () => {
        const { backup, journalPath, beforeFiles } = committedReplacementBackup(
            [],
        );
        const journal = JSON.parse(layoutRecords.get(journalPath) as string);
        delete journal.beforeCleanupFiles;
        layoutRecords.set(journalPath, JSON.stringify(journal));
        switchRecording.enabled = true;
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory === backup
                ? beforeFiles
                : [
                      {
                          relative: 'web.zip',
                          size: 1,
                          hash: 'c'.repeat(64),
                          mode: 0o644,
                      },
                  ],
        );

        await service.recoverSavedProjects();

        expect(fs.promises.rm).toHaveBeenCalledWith(backup, {
            recursive: true,
        });
        expect(layoutRecords.has(journalPath)).toBe(false);
    });

    it.each([
        ['added', 'extra.zip', 'a'.repeat(64)],
        ['changed', 'web.zip', 'd'.repeat(64)],
    ])(
        'preserves an old backup with an %s file',
        async (_kind, relative, hash) => {
            const { backup, journalPath } = committedReplacementBackup([
                { relative, size: 1, hash, mode: 0o644 },
            ]);

            await expect(service.recoverSavedProjects()).rejects.toThrow(
                'exportTemplates:errors.recovery',
            );

            expect(fs.promises.rm).not.toHaveBeenCalledWith(backup, {
                recursive: true,
            });
            expect(layoutRecords.has(journalPath)).toBe(true);
        },
    );
    it('leaves files untouched when the switch journal fails validation', async () => {
        const journalPath = path.resolve(
            'imports',
            'imported-template-switch.json',
        );
        layoutRecords.set(journalPath, '{}');
        vi.mocked(switchJournalSchema.parse).mockImplementationOnce(() => {
            throw new Error('invalid switch journal');
        });

        await expect(service.recoverSavedProjects()).rejects.toThrow(
            'invalid switch journal',
        );

        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(layoutRecords.has(journalPath)).toBe(true);
    });
    it('finishes interrupted incoming cleanup when only recorded files remain', async () => {
        const build = {
            ...first,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        };
        library.builds[0] = build;
        const incomingRevision = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const incoming = path.resolve(
            'imports',
            '.staging',
            `incoming-${build.id}-${incomingRevision}`,
        );
        importedDirectories.add(path.dirname(incoming));
        importedDirectories.add(incoming);
        const manifest = [
            {
                relative: 'web.zip',
                size: 1,
                hash: 'a'.repeat(64),
                mode: 0o644,
            },
        ];
        const fingerprint = templateFingerprint(manifest);
        vi.mocked(readTemplateTree).mockImplementation(async (directory) => {
            if (directory === incoming) return [];
            return manifest;
        });
        const journalPath = path.resolve(
            'imports',
            'imported-template-switch.json',
        );
        layoutRecords.set(
            journalPath,
            JSON.stringify({
                version: 1,
                kind: 'replace',
                id: build.id,
                setId: build.setId,
                beforeRevision: build.revision,
                afterRevision: incomingRevision,
                beforeDirectoryName: build.directoryName,
                afterDirectoryName: build.directoryName,
                beforeFingerprint: fingerprint,
                afterFingerprint: fingerprint,
                rollbackCleanupFiles: manifest,
            }),
        );

        await service.recoverSavedProjects();

        expect(importedDirectories.has(incoming)).toBe(false);
        expect(layoutRecords.has(journalPath)).toBe(false);
    });
    it.each([
        ['added', 'new.zip', 'a'.repeat(64)],
        ['changed', 'web.zip', 'b'.repeat(64)],
    ])(
        'refuses to remove an incoming copy with %s files',
        async (_kind, relative, hash) => {
            const build = {
                ...first,
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            };
            library.builds[0] = build;
            const incomingRevision = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
            const incoming = path.resolve(
                'imports',
                '.staging',
                `incoming-${build.id}-${incomingRevision}`,
            );
            importedDirectories.add(path.dirname(incoming));
            importedDirectories.add(incoming);
            const manifest = [
                {
                    relative: 'web.zip',
                    size: 1,
                    hash: 'a'.repeat(64),
                    mode: 0o644,
                },
            ];
            const fingerprint = templateFingerprint(manifest);
            vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
                directory === incoming
                    ? [{ relative, size: 1, hash, mode: 0o644 }]
                    : manifest,
            );
            const journalPath = path.resolve(
                'imports',
                'imported-template-switch.json',
            );
            layoutRecords.set(
                journalPath,
                JSON.stringify({
                    version: 1,
                    kind: 'replace',
                    id: build.id,
                    setId: build.setId,
                    beforeRevision: build.revision,
                    afterRevision: incomingRevision,
                    beforeDirectoryName: build.directoryName,
                    afterDirectoryName: build.directoryName,
                    beforeFingerprint: fingerprint,
                    afterFingerprint: fingerprint,
                    rollbackCleanupFiles: manifest,
                }),
            );

            await expect(service.recoverSavedProjects()).rejects.toThrow(
                'exportTemplates:errors.recovery',
            );

            expect(fs.promises.rm).not.toHaveBeenCalledWith(incoming, {
                recursive: true,
            });
            expect(importedDirectories.has(incoming)).toBe(true);
            expect(layoutRecords.has(journalPath)).toBe(true);
        },
    );
    it('moves a renamed package folder without changing unselected projects', async () => {
        await service.rename('one', 'Encrypted v2');
        expect(library.builds[0].label).toBe('Encrypted v2');
        expect(library.builds[0].directoryName).toBe('Encrypted v2');
        expect(fs.promises.rename).toHaveBeenCalledWith(
            path.resolve('imports', 'imported', '4.4.stable', 'Encrypted'),
            path.resolve('imports', 'imported', '4.4.stable', 'Encrypted v2'),
        );
        expect(projectTemplateBuilds).not.toHaveBeenCalled();
        expect(fs.promises.rm).not.toHaveBeenCalled();
    });
    it('renames and reconnects an active selection without reading contents or checking editors', async () => {
        switchRecording.enabled = true;
        projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
        vi.mocked(assertTemplateEditorsClosed).mockRejectedValue(
            new Error('exportTemplates:library.editorRunning'),
        );

        await service.rename('one', 'Encrypted v2');

        expect(library.builds[0].directoryName).toBe('Encrypted v2');
        expect(projectTemplateBuilds).toHaveBeenCalledWith(
            path.dirname(projects[0].launch_path as string),
            path.resolve('shared'),
            expect.objectContaining({
                builds: expect.arrayContaining([
                    expect.objectContaining({ directoryName: 'Encrypted v2' }),
                ]),
            }),
            projects[0].exportTemplateBuilds,
            '4.4.stable',
        );
        expect(readTemplateTree).not.toHaveBeenCalled();
        expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        expect(layoutRecords.size).toBe(0);
    });
    it('restores the original folder if saving the renamed metadata fails', async () => {
        switchRecording.enabled = true;
        vi.mocked(writeImportedTemplates).mockRejectedValueOnce(
            new Error('store failed'),
        );

        await expect(service.rename('one', 'Encrypted v2')).rejects.toThrow(
            'store failed',
        );

        expect(library.builds[0].directoryName).toBe('Encrypted');
        expect(
            importedDirectories.has(
                path.resolve('imports', 'imported', first.setId, 'Encrypted'),
            ),
        ).toBe(true);
        expect(
            importedDirectories.has(
                path.resolve(
                    'imports',
                    'imported',
                    first.setId,
                    'Encrypted v2',
                ),
            ),
        ).toBe(false);
        expect(readTemplateTree).not.toHaveBeenCalled();
        expect(layoutRecords.size).toBe(0);
    });
    it('refuses to rename a package folder replaced by a symbolic link', async () => {
        const originalStat = vi.mocked(templateLstat).getMockImplementation();
        const original = path.resolve(
            'imports',
            'imported',
            first.setId,
            'Encrypted',
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) =>
            filename === original
                ? ({
                      isDirectory: () => true,
                      isSymbolicLink: () => true,
                  } as fs.Stats)
                : originalStat?.(filename),
        );

        await expect(service.rename('one', 'Encrypted v2')).rejects.toThrow(
            'exportTemplates:library.folderConflict',
        );

        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it.each([false, true])(
        'recovers a committed rename without hashes (legacy journal: %s)',
        async (legacy) => {
            const before = path.resolve(
                'imports',
                'imported',
                first.setId,
                'Encrypted',
            );
            const after = path.resolve(
                'imports',
                'imported',
                first.setId,
                'Encrypted v2',
            );
            library.builds[0] = {
                ...first,
                label: 'Encrypted v2',
                directoryName: 'Encrypted v2',
            };
            const journalPath = path.resolve(
                'imports',
                'imported-template-switch.json',
            );
            layoutRecords.set(
                journalPath,
                JSON.stringify({
                    version: 1,
                    kind: 'rename',
                    id: first.id,
                    setId: first.setId,
                    beforeRevision: first.revision,
                    afterRevision: first.revision,
                    beforeDirectoryName: 'Encrypted',
                    afterDirectoryName: 'Encrypted v2',
                    ...(legacy
                        ? {
                              beforeFingerprint: 'a'.repeat(64),
                              afterFingerprint: 'a'.repeat(64),
                          }
                        : {}),
                }),
            );
            projects[0].exportTemplateBuilds = { '4.4.stable': 'one' };
            const unrelated = {
                ...projects[0],
                path: path.resolve('unrelated-game'),
                launch_path: path.resolve('unrelated-editor', 'Godot'),
                exportTemplateBuilds: { '4.4.stable': 'two' },
            };
            projects.push(unrelated);
            vi.mocked(projectTemplateBuilds).mockImplementation(
                async (editor) => {
                    if (
                        editor === path.dirname(unrelated.launch_path as string)
                    )
                        throw new Error(
                            'unrelated local templates await migration',
                        );
                },
            );

            await service.recoverSavedProjects();

            expect(importedDirectories.has(before)).toBe(false);
            expect(importedDirectories.has(after)).toBe(true);
            expect(readTemplateTree).not.toHaveBeenCalled();
            expect(layoutRecords.has(journalPath)).toBe(false);
            expect(projectTemplateBuilds).toHaveBeenCalledOnce();
        },
    );
    it('preserves both folders and the journal when rename recovery finds a conflict', async () => {
        switchRecording.enabled = true;
        vi.mocked(writeImportedTemplates).mockImplementationOnce(async () => {
            importedDirectories.add(
                path.resolve('imports', 'imported', first.setId, 'Encrypted'),
            );
            throw new Error('store failed');
        });

        await expect(service.rename('one', 'Encrypted v2')).rejects.toThrow(
            'exportTemplates:errors.recovery',
        );

        expect(fs.promises.rename).toHaveBeenCalledOnce();
        expect(fs.promises.rm).not.toHaveBeenCalled();
        expect(
            layoutRecords.has(
                path.resolve('imports', 'imported-template-switch.json'),
            ),
        ).toBe(true);
    });
    it('rejects an imported package whose tag is already used', async () => {
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: false,
            filePaths: [path.resolve('new.tpz')],
        });
        vi.mocked(fs.promises.stat).mockResolvedValue({
            isFile: () => true,
            size: 10,
            mtimeMs: 1,
            ctimeMs: 1,
            ino: 1,
            dev: 1,
        } as fs.Stats);
        service = new ImportedTemplatesService(
            { list: async () => projects, update } as unknown as ProjectsStore,
            {
                extract: vi.fn(async () => ({
                    identity: '4.4.stable',
                    contents: path.resolve('extracted'),
                })),
            } as unknown as TemplateArchiveAdapter,
        );
        const selected = await service.choose();
        if (!selected) throw new Error('Expected selected archive');
        await service.prepare(selected.token);
        await expect(
            service.install(selected.token, ' encrypted '),
        ).rejects.toThrow('exportTemplates:library.duplicateLabel');
        expect(library.builds).toEqual([first, second]);
        expect(fs.promises.cp).not.toHaveBeenCalled();
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it('rejects a tag already used by another build of the same Godot set', async () => {
        await expect(service.rename('two', ' encrypted ')).rejects.toThrow(
            'exportTemplates:library.duplicateLabel',
        );
        expect(library.builds[1].label).toBe('Steam');
        expect(writeImportedTemplates).not.toHaveBeenCalled();
        await service.rename('one', ' encrypted ');
        expect(library.builds[0].label).toBe('encrypted');
    });
    it('rejects an unregistered folder that collides without regard to case', async () => {
        readDirectory.mockResolvedValue(['OTHER TAG']);
        await expect(service.rename('one', 'Other Tag')).rejects.toThrow(
            'exportTemplates:library.folderConflict',
        );
        expect(writeImportedTemplates).not.toHaveBeenCalled();
    });
    it('allows the same tag for a different Godot set', async () => {
        library.builds[1] = { ...library.builds[1], setId: '4.3.stable' };
        importedDirectories.add(
            path.resolve('imports', 'imported', '4.3.stable', 'Steam'),
        );
        await service.rename('two', 'Encrypted');
        expect(library.builds[1].label).toBe('Encrypted');
    });
    it('restores the old casing if a case-only rename stops between its two moves', async () => {
        const build = {
            ...first,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            label: 'Tag',
            directoryName: 'Tag',
        };
        library = { schemaVersion: 1, builds: [build] };
        projects[0].exportTemplateBuilds = { '4.4.stable': build.id };
        const parent = path.resolve('imports', 'imported', build.setId);
        const original = path.join(parent, 'Tag');
        const renamed = path.join(parent, 'tag');
        const stage = path.resolve(
            'imports',
            '.staging',
            `case-${build.id}-${build.revision}`,
        );
        importedDirectories.add(original);
        switchRecording.enabled = true;
        readDirectory.mockImplementation(async (folder) =>
            folder === parent
                ? [...importedDirectories]
                      .filter((entry) => path.dirname(entry) === parent)
                      .map((entry) => path.basename(entry))
                : [],
        );
        vi.mocked(templateLstat).mockImplementation(async (filename) => {
            const direct = importedDirectories.has(String(filename));
            const alias = [...importedDirectories].some(
                (entry) =>
                    path.dirname(entry) === path.dirname(String(filename)) &&
                    path.basename(entry).toLowerCase() ===
                        path.basename(String(filename)).toLowerCase(),
            );
            return direct || alias
                ? ({
                      isDirectory: () => true,
                      isSymbolicLink: () => false,
                  } as fs.Stats)
                : undefined;
        });
        let moves = 0;
        vi.mocked(fs.promises.rename).mockImplementation(
            async (source, target) => {
                moves += 1;
                if (moves === 2) throw new Error('rename interrupted');
                importedDirectories.delete(String(source));
                importedDirectories.add(String(target));
            },
        );
        await expect(service.rename(build.id, 'tag')).rejects.toThrow(
            'rename interrupted',
        );
        expect(importedDirectories.has(original)).toBe(true);
        expect(importedDirectories.has(renamed)).toBe(false);
        expect(importedDirectories.has(stage)).toBe(false);
        expect(library.builds[0].directoryName).toBe('Tag');
        expect(
            layoutRecords.has(
                path.resolve('imports', 'imported-template-switch.json'),
            ),
        ).toBe(false);
        await service.rename(build.id, 'tag');
        expect(importedDirectories.has(original)).toBe(false);
        expect(importedDirectories.has(renamed)).toBe(true);
        expect(library.builds[0].directoryName).toBe('tag');
        expect(readTemplateTree).not.toHaveBeenCalled();
        expect(assertTemplateEditorsClosed).not.toHaveBeenCalled();
        expect(projectTemplateBuilds).toHaveBeenCalledWith(
            path.dirname(projects[0].launch_path as string),
            path.resolve('shared'),
            expect.objectContaining({
                builds: [expect.objectContaining({ directoryName: 'tag' })],
            }),
            projects[0].exportTemplateBuilds,
            '4.4.stable',
        );
    });
});

vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    templateLstat: vi.fn(async () => ({
        isDirectory: () => true,
        isSymbolicLink: () => false,
    })),
    readTemplateTree: vi.fn(),
    checkTemplateCapacity: vi.fn(),
}));
