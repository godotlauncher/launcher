import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EditorCatalogRelease, ProjectDetails } from '@shared/contracts';
import { shell } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import type { ProjectsStore } from '../projects/projects.store.js';
import { ExportTemplatesService } from './export-templates.service.js';
import { readImportedTemplates } from './imported-templates.store.js';
import type { TemplateArchiveAdapter } from './template-archive.adapter.js';
import { assessProjectTemplates } from './template-assessment.util.js';
import { updateTemplateFiles } from './template-file-update.util.js';
import {
    extractTemplateRange,
    openTemplateRange,
} from './template-range.adapter.js';

vi.mock('./template-file-update.util.js', () => ({
    updateTemplateFiles: vi.fn(),
    pruneEmptyTemplateDirectories: vi.fn(),
}));
vi.mock('./template-storage.service.js', () => ({
    TemplateStorageService: class {
        recover = vi.fn(async () => undefined);
        assertAvailable = vi.fn(async () => undefined);
        workRoots = vi.fn(async () => []);
        isActive = vi.fn(() => false);
    },
}));
const extractTemplateArchive = vi.fn();
const importedMocks = vi.hoisted(() => ({
    saveProject: vi.fn(),
    recoverSavedProjects: vi.fn(),
    cleanupAbandonedPreviews: vi.fn(),
    synchronise: vi.fn(),
    remove: vi.fn(),
    isBuildAvailable: vi.fn(),
}));
vi.mock('./template-assessment.util.js', async (load) => ({
    ...(await load<typeof import('./template-assessment.util.js')>()),
    assessProjectTemplates: vi.fn(),
}));

import {
    areTemplatesMutating,
    connectEmptyTemplateFolder,
    readTemplateTree,
    reserveTemplateConnection,
    setTemplatesMutating,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';

import {
    commitTemplateTransaction,
    readTemplateJournal,
    recoverTemplateTransaction,
} from './template-transaction.util.js';

vi.mock('./template-range.adapter.js', () => ({
    openTemplateRange: vi.fn(),
    extractTemplateRange: vi.fn(),
}));
vi.mock('node:fs', () => ({
    promises: {
        mkdir: vi.fn(),
        lstat: vi.fn(),
        realpath: vi.fn(),
        rm: vi.fn(),
        readdir: vi.fn(),
        rmdir: vi.fn(),
    },
}));
vi.mock('@mariodebono/di', () => ({ Injectable: () => () => undefined }));
vi.mock('../editor-catalog/editor-catalog.service.js', () => ({
    EditorCatalogService: class {},
}));
vi.mock('../projects/projects.store.js', () => ({ ProjectsStore: class {} }));
vi.mock('@mariodebono/di-electron', () => ({
    AppReady: () => () => {},
    AppReadyOrder: { BeforeWindow: 'beforeWindow' },
}));
vi.mock('./template-editor-running.util.js', () => ({
    assertTemplateEditorsClosed: vi.fn(),
}));
vi.mock('electron', () => ({ dialog: {}, shell: { openPath: vi.fn() } }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));
vi.mock('./template-archive.adapter.js', () => ({
    TemplateArchiveAdapter: class {},
}));
vi.mock('./template-runtime.util.js', () => ({
    getSharedTemplateRoot: () => path.resolve('fixture-shared'),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    checkTemplateCapacity: vi.fn(),
    connectEmptyTemplateFolder: vi.fn(),
    templateLstat: vi.fn(),
    readTemplateTree: vi.fn(),
    templateConnectionStatus: vi.fn(),
}));

vi.mock('./template-transaction.util.js', () => ({
    commitTemplateTransaction: vi.fn(),
    readTemplateJournal: vi.fn(),
    recoverTemplateTransaction: vi.fn(),
}));
const list = vi.fn();
const updateProjects = vi.fn();
const getReleaseById = vi.fn();
const getCatalog = vi.fn();
const release = {
    id: 'official-stable:4.4-stable',
    tag: '4.4-stable',
    templateAssets: [
        {
            id: 'templates',
            name: 'Godot_v4.4-stable_export_templates.tpz',
            flavor: 'gdscript',
            downloadUrl:
                'https://github.com/godotengine/godot-builds/releases/download/4.4-stable/Godot_v4.4-stable_export_templates.tpz',
            sizeBytes: 1024,
            digest: `sha256:${'a'.repeat(64)}`,
        },
    ],
} as EditorCatalogRelease;
let service: ExportTemplatesService;
afterEach(async () => {
    for (const job of (await service.getJobs()).reverse()) {
        if (['queued', 'error'].includes(job.stage))
            await service.cancel(job.id);
    }
});
beforeEach(() => {
    vi.resetAllMocks();
    setTemplatesMutating(false);
    vi.mocked(fs.promises.realpath).mockResolvedValue(
        path.resolve('fixture-shared'),
    );
    vi.mocked(fs.promises.lstat).mockResolvedValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
    } as fs.Stats);
    vi.mocked(readTemplateTree).mockResolvedValue([]);
    vi.mocked(extractTemplateArchive).mockResolvedValue({
        identity: '4.4.stable',
        contents: path.resolve('extracted'),
    });
    getReleaseById.mockResolvedValue(release);
    getCatalog.mockResolvedValue({ releases: [release] });
    list.mockResolvedValue([]);
    service = new ExportTemplatesService(
        { getReleaseById, getCatalog } as unknown as EditorCatalogService,
        { list, update: updateProjects } as unknown as ProjectsStore,
        {
            extract: extractTemplateArchive,
        } as unknown as TemplateArchiveAdapter,
    );
});

describe('export template operations', () => {
    it('cleans abandoned import previews after durable startup recovery', async () => {
        await service.restoreTemplateLinks();
        expect(importedMocks.cleanupAbandonedPreviews).toHaveBeenCalledOnce();
        expect(
            importedMocks.recoverSavedProjects.mock.invocationCallOrder[0],
        ).toBeLessThan(
            importedMocks.cleanupAbandonedPreviews.mock.invocationCallOrder[0],
        );
    });
    it('opens the stored files of a registered imported build', async () => {
        const build = {
            id: 'build-id',
            revision: 'revision-id',
            setId: '4.4.stable',
            directoryName: 'Readable build',
        };
        vi.mocked(readImportedTemplates).mockResolvedValue({
            schemaVersion: 1,
            builds: [build],
        } as never);
        vi.mocked(templateLstat).mockResolvedValue({
            isDirectory: () => true,
            isSymbolicLink: () => false,
        } as fs.Stats);
        vi.mocked(shell.openPath).mockResolvedValue('');

        await service.openImportedTemplateFolder(build.id);

        expect(shell.openPath).toHaveBeenCalledWith(
            path.resolve(
                'fixture-imports',
                'imported',
                build.setId,
                build.directoryName,
            ),
        );
        await expect(
            service.openImportedTemplateFolder('unknown'),
        ).rejects.toThrow('exportTemplates:library.missing');
        expect(shell.openPath).toHaveBeenCalledOnce();
    });
    it('forwards reviewed imported-build replacement under the library mutation guard', async () => {
        const options = {
            replacement: 'official',
            revision: 'reviewed-revision',
            references: [
                {
                    projectPath: path.resolve('game'),
                    currentSetId: '4.4.stable',
                    active: true,
                },
            ],
        };
        importedMocks.remove.mockImplementation(async () => {
            expect(areTemplatesMutating()).toBe(true);
        });
        await service.removeImportedTemplate('old-build', options);
        expect(importedMocks.remove).toHaveBeenCalledWith('old-build', options);
    });
    it('cancels a job waiting for an editor connection without starting its file operation', async () => {
        vi.mocked(templateLstat).mockResolvedValueOnce({
            isDirectory: () => true,
            isSymbolicLink: () => false,
        } as fs.Stats);
        const selection = await service.getLocalPackage('4.4.stable');
        const releaseConnection = await reserveTemplateConnection();
        try {
            await service.savePackage(selection.token, []);
            await vi.waitFor(async () =>
                expect((await service.getJobs())[0]?.stage).toBe('preparing'),
            );
            const [job] = await service.getJobs();
            await service.cancel(job.id);
        } finally {
            releaseConnection();
        }
        await vi.waitFor(async () =>
            expect((await service.getJobs())[0]?.stage).toBe('cancelled'),
        );
        expect(extractTemplateRange).not.toHaveBeenCalled();
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(areTemplatesMutating()).toBe(false);
    });
});

describe('template migration policy', () => {
    const project = {
        path: path.resolve('project'),
        name: 'Project',
        launch_path: path.resolve('editor', 'Godot'),
        release: { source: 'official', version: '4.4-stable', mono: false },
    } as ProjectDetails;
    const local = path.join(
        path.dirname(project.launch_path),
        'editor_data',
        'export_templates',
    );
    const web = {
        relative: 'web.zip',
        hash: 'local-web',
        size: 20,
        mode: 0o755,
    };
    const linux = { relative: 'linux', hash: 'linux', size: 30, mode: 0o755 };
    const sharedWeb = { ...web, hash: 'shared-web', mode: 0o644 };
    beforeEach(() => {
        list.mockResolvedValue([project]);
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
        ] as never);
        vi.mocked(readTemplateTree).mockImplementation(async (directory) => {
            if (directory === local)
                return [web, linux].map((file) => ({
                    ...file,
                    relative: `4.4.stable/${file.relative}`,
                }));
            return directory.startsWith(local + path.sep)
                ? [web, linux]
                : [sharedWeb];
        });
    });
    it('migrates local templates through the imported library without repeating its synchronisation', async () => {
        importedMocks.synchronise.mockRejectedValue(
            new Error('Unexpected second synchronisation'),
        );
        await service.prepareMigration(project.path, 'save-imported');
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(readTemplateTree).not.toHaveBeenCalled();
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(updateTemplateFiles).not.toHaveBeenCalled();
        expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        expect(importedMocks.saveProject).toHaveBeenCalledWith(project, local);
        expect(importedMocks.synchronise).not.toHaveBeenCalled();
    });
    it('adds missing files and preserves existing shared contents and permissions without review', async () => {
        await service.prepareMigration(project.path, 'share-project');
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(importedMocks.synchronise).toHaveBeenCalledExactlyOnceWith(
            undefined,
            [project],
        );
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            path.join(path.resolve('fixture-shared'), '4.4.stable'),
            path.join(local, '4.4.stable'),
            ['web.zip', 'linux'],
            [],
            true,
        );
        expect(commitTemplateTransaction).toHaveBeenCalledWith(
            path.resolve('fixture-shared'),
            expect.any(String),
            expect.objectContaining({
                projectPath: project.path,
                retainBackup: false,
            }),
            local,
            path.resolve('fixture-shared'),
        );
    });
    it('merges every installed version and edition for a project-level merge', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.3.stable',
            '4.3.stable.mono',
        ] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...web, relative: '4.4.stable/web.zip' },
            { ...linux, relative: '4.3.stable/linux' },
            { ...web, relative: '4.3.stable.mono/custom.zip' },
        ]);
        await service.prepareMigration(project.path, 'share-project');
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledTimes(3);
        for (const [id, file] of [
            ['4.4.stable', 'web.zip'],
            ['4.3.stable', 'linux'],
            ['4.3.stable.mono', 'custom.zip'],
        ]) {
            expect(updateTemplateFiles).toHaveBeenCalledWith(
                path.join(path.resolve('fixture-shared'), id),
                path.join(local, id),
                [file],
                [],
                true,
            );
        }
        expect((await service.getJobs()).at(-1)?.setIds).toEqual([
            '4.4.stable',
            '4.3.stable',
            '4.3.stable.mono',
        ]);
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every((call) => call[1] === false),
        ).toBe(true);
        expect(commitTemplateTransaction).toHaveBeenCalledOnce();
    });
    it('merges only versions explicitly selected and connects after all merges finish', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.3.stable',
        ] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...web, relative: '4.4.stable/web.zip' },
            { ...linux, relative: '4.3.stable/linux' },
        ]);
        await service.prepareMigration(project.path, 'share-project', {
            '4.4.stable': 'use-shared',
            '4.3.stable': 'share-project',
        });
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledExactlyOnceWith(
            path.join(path.resolve('fixture-shared'), '4.3.stable'),
            path.join(local, '4.3.stable'),
            ['linux'],
            [],
            true,
        );
        expect(commitTemplateTransaction).toHaveBeenCalledOnce();
        expect(
            vi.mocked(updateTemplateFiles).mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(commitTemplateTransaction).mock.invocationCallOrder[0],
        );
    });
    it.each([
        {},
        { '4.4.stable': 'share-project', '4.3.stable': 'use-shared' },
    ] as const)(
        'rejects missing or obsolete decisions before copying or connecting',
        async (choices) => {
            await service.prepareMigration(
                project.path,
                'share-project',
                choices,
            );
            await vi.waitFor(async () =>
                expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
            );
            expect((await service.getJobs()).at(-1)?.error).toBe(
                'exportTemplates:errors.changed',
            );
            expect(updateTemplateFiles).not.toHaveBeenCalled();
            expect(commitTemplateTransaction).not.toHaveBeenCalled();
            expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        },
    );
    it('does not connect or delete local originals when any version fails to merge', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.3.stable',
        ] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...web, relative: '4.4.stable/web.zip' },
            { ...linux, relative: '4.3.stable/linux' },
        ]);
        vi.mocked(updateTemplateFiles)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('exportTemplates:errors.read'));
        await service.prepareMigration(project.path, 'share-project', {
            '4.4.stable': 'share-project',
            '4.3.stable': 'share-project',
        });
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledTimes(2);
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(updateProjects).not.toHaveBeenCalled();
    });
    it.each([
        { '../outside': 'share-project' },
        { '4.4.stable': 'unknown' },
        null,
        [],
    ])('rejects invalid version decisions at the boundary', async (choices) => {
        await expect(
            service.prepareMigration(
                project.path,
                'share-project',
                choices as never,
            ),
        ).rejects.toThrow('exportTemplates:errors.decision');
        expect(updateTemplateFiles).not.toHaveBeenCalled();
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it.each([true, false])(
        'discards local files without changing shared files (shared set exists: %s)',
        async (exists) => {
            vi.mocked(readTemplateTree).mockImplementation(
                async (directory) => {
                    if (directory === local)
                        return [web, linux].map((file) => ({
                            ...file,
                            relative: `4.4.stable/${file.relative}`,
                        }));
                    return directory.startsWith(local + path.sep)
                        ? [web, linux]
                        : exists
                          ? [sharedWeb]
                          : [];
                },
            );
            await service.prepareMigration(project.path, 'use-shared');
            await vi.waitFor(async () =>
                expect((await service.getJobs()).at(-1)?.stage).toBe(
                    'complete',
                ),
            );
            expect(commitTemplateTransaction).toHaveBeenCalledWith(
                path.resolve('fixture-shared'),
                expect.any(String),
                expect.objectContaining({
                    projectPath: project.path,
                    retainBackup: false,
                    sets: [],
                }),
                local,
                path.resolve('fixture-shared'),
            );
        },
    );
    it('keeps each edition in its matching shared version folder', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.4.stable.mono',
        ] as never);
        vi.mocked(readTemplateTree).mockImplementation(async (directory) => {
            if (directory === local)
                return ['4.4.stable', '4.4.stable.mono'].map((id) => ({
                    ...web,
                    relative: `${id}/${web.relative}`,
                }));
            return directory.startsWith(local + path.sep) ? [web] : [];
        });
        await service.prepareMigration(project.path);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            path.join(path.resolve('fixture-shared'), '4.4.stable'),
            path.join(local, '4.4.stable'),
            ['web.zip'],
            [],
            true,
        );
        expect(updateTemplateFiles).toHaveBeenCalledTimes(2);
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            path.join(path.resolve('fixture-shared'), '4.4.stable.mono'),
            path.join(local, '4.4.stable.mono'),
            ['web.zip'],
            [],
            true,
        );
    });
    it('keeps the project local if a missing file cannot be copied', async () => {
        vi.mocked(updateTemplateFiles).mockRejectedValue(
            new Error('exportTemplates:errors.changed'),
        );
        await service.prepareMigration(project.path);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect((await service.getJobs()).at(-1)?.error).toBe(
            'exportTemplates:errors.changed',
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('queues projects sequentially and rejects duplicate submissions while active', async () => {
        const second = {
            ...project,
            path: path.resolve('second-project'),
            launch_path: path.resolve('second-editor', 'Godot'),
        };
        list.mockResolvedValue([project, second]);
        let releaseCommit!: () => void;
        vi.mocked(commitTemplateTransaction).mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    releaseCommit = resolve;
                }),
        );
        await service.prepareMigration(project.path);
        await vi.waitFor(() =>
            expect(commitTemplateTransaction).toHaveBeenCalledTimes(1),
        );
        await service.prepareMigration(second.path);
        await expect(service.prepareMigration(project.path)).rejects.toThrow(
            'errors.busy',
        );
        expect((await service.getJobs()).map((job) => job.stage)).toEqual([
            'applying',
            'queued',
        ]);
        // The second project has no files and observes the shared collection only when executed.
        vi.mocked(templateConnectionStatus).mockImplementation(
            async (filename) =>
                filename.includes('second-editor') ? 'shared' : 'local',
        );
        releaseCommit();
        await vi.waitFor(async () =>
            expect(
                (await service.getJobs()).every(
                    (job) => job.stage === 'complete',
                ),
            ).toBe(true),
        );
    });
    it.each(['local', 'missing'] as const)(
        'connects an empty %s collection without a review',
        async (initialStatus) => {
            vi.mocked(templateConnectionStatus)
                .mockResolvedValue('shared')
                .mockResolvedValueOnce(initialStatus)
                .mockResolvedValueOnce(initialStatus);
            vi.mocked(fs.promises.readdir).mockResolvedValue([]);
            await service.prepareMigration(project.path, 'share-project');
            await vi.waitFor(async () =>
                expect((await service.getJobs()).at(-1)?.stage).toBe(
                    'complete',
                ),
            );
            expect(connectEmptyTemplateFolder).toHaveBeenCalledWith(
                path.dirname(project.launch_path),
                project.release,
                path.resolve('fixture-shared'),
            );
            expect(commitTemplateTransaction).not.toHaveBeenCalled();
        },
    );
    it('automatic discovery skips separate and custom projects and connects only empty candidates', async () => {
        const separate = {
            ...project,
            path: path.resolve('separate'),
            exportTemplateMode: 'separate' as const,
        };
        const custom = {
            ...project,
            path: path.resolve('custom'),
            release: { ...project.release, source: 'custom' as const },
        };
        list.mockResolvedValue([project, separate, custom]);
        vi.mocked(assessProjectTemplates).mockImplementation(async (item) => ({
            projectPath: item.path,
            name: item.name,
            state: 'ready',
            reason: 'empty',
            pending: item === project,
            compared: false,
            provenance: 'unverified',
            setIds: [],
            metadata: [],
            unexpected: [],
        }));
        vi.mocked(templateConnectionStatus)
            .mockResolvedValue('shared')
            .mockResolvedValueOnce('missing')
            .mockResolvedValueOnce('missing');
        await service.connectEmptyProjects();
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect((await service.getJobs()).map((job) => job.projectPath)).toEqual(
            [project.path],
        );
    });
    it('automatic connections refuse files added after discovery', async () => {
        vi.mocked(assessProjectTemplates).mockResolvedValue({
            projectPath: project.path,
            name: project.name,
            state: 'ready',
            reason: 'empty',
            pending: true,
            compared: false,
            provenance: 'unverified',
            setIds: [],
            metadata: [],
            unexpected: [],
        });
        await service.connectEmptyProjects();
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
});

describe('template migration recovery', () => {
    it.each(['removed', 'custom', 'missing editor'])(
        'recovers a saved location after the project is %s and allows another operation',
        async (state) => {
            const root = path.resolve('fixture-shared');
            const parent = path.join(
                path.dirname(root),
                '.godot-launcher-template-work',
            );
            const id = '11111111-1111-1111-1111-111111111111';
            const directory = path.join(parent, id);
            const projectPath = path.resolve('project');
            const localPath = path.resolve(
                'editor',
                'editor_data',
                'export_templates',
            );
            list.mockResolvedValue(
                state === 'removed'
                    ? []
                    : [
                          {
                              path: projectPath,
                              release: {
                                  source:
                                      state === 'custom'
                                          ? 'custom'
                                          : 'official',
                              },
                              launch_path:
                                  state === 'missing editor'
                                      ? ''
                                      : path.resolve('other-editor', 'Godot'),
                          },
                      ],
            );
            let recovered = false;
            vi.mocked(templateLstat).mockImplementation(async (filename) =>
                !recovered &&
                [
                    root,
                    parent,
                    directory,
                    path.join(directory, 'journal.json'),
                ].includes(filename)
                    ? ({
                          isDirectory: () => true,
                          isSymbolicLink: () => false,
                      } as fs.Stats)
                    : undefined,
            );
            vi.mocked(fs.promises.readdir).mockResolvedValue([id] as never);
            vi.mocked(readTemplateJournal).mockResolvedValue({
                version: 2,
                phase: 'committing',
                projectPath,
                localPath,
                sourceHash: templateFingerprint([]),
                sets: [],
            });
            vi.mocked(recoverTemplateTransaction).mockImplementation(
                async () => {
                    recovered = true;
                },
            );

            await expect(service.recover(id)).resolves.toBeUndefined();
            expect(list).not.toHaveBeenCalled();
            expect(recoverTemplateTransaction).toHaveBeenCalledWith(
                root,
                directory,
                root,
            );
            vi.mocked(templateLstat).mockResolvedValueOnce({
                isDirectory: () => true,
                isSymbolicLink: () => false,
            } as fs.Stats);
            const selection = await service.getLocalPackage('4.4.stable');
            await service.savePackage(selection.token, []);
            await vi.waitFor(async () =>
                expect((await service.getJobs()).at(-1)?.stage).toBe(
                    'complete',
                ),
            );
        },
    );
});

describe('partial template saves', () => {
    /** Provides a cached archive directory without network access. */
    function index() {
        vi.mocked(openTemplateRange).mockResolvedValue({
            index: {
                url: 'https://example.test/templates.tpz',
                size: 100,
                validator: 'fixture',
                fingerprint: 'archive',
                prefix: '',
                entries: [
                    {
                        fileName: 'version.txt',
                        uncompressedSize: 10,
                        compressedSize: 10,
                    },
                    {
                        fileName: 'macos.zip',
                        uncompressedSize: 10,
                        compressedSize: 10,
                    },
                ],
            },
            zip: { close: vi.fn() },
        } as unknown as Awaited<ReturnType<typeof openTemplateRange>>);
    }
    it('rejects an unknown asset without requesting a renderer-supplied URL', async () => {
        await expect(
            service.getPackage(release.id, 'https://untrusted.invalid/package'),
        ).rejects.toThrow('exportTemplates:errors.package');
        expect(openTemplateRange).not.toHaveBeenCalled();
    });
    it('caches the archive index without refreshing GitHub on repeated selections', async () => {
        index();
        const first = await service.getPackage(release.id, 'templates');
        const second = await service.getPackage(release.id, 'templates');
        expect(first.files).toEqual([
            { path: 'macos.zip', sizeBytes: 10, downloadBytes: 10 },
        ]);
        expect(second.token).not.toBe(first.token);
        expect(openTemplateRange).toHaveBeenCalledOnce();
        expect(getCatalog).toHaveBeenCalledWith({ refreshIfStale: false });
    });
    it('lists available files without hashing installed export templates', async () => {
        index();
        await service.getPackage(release.id, 'templates');
        expect(readTemplateTree).toHaveBeenCalledWith(
            expect.any(String),
            false,
            undefined,
            true,
        );
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every((call) => call[1] === false),
        ).toBe(true);
    });
    it('rejects a same-size edit recorded by filesystem metadata before saving', async () => {
        index();
        const file = {
            relative: 'macos.zip',
            size: 1,
            hash: '',
            mode: 0o644,
            metadata: { mtimeMs: 1, ctimeMs: 1, ino: 1, dev: 1 },
        };
        vi.mocked(readTemplateTree).mockResolvedValue([file]);
        const info = await service.getPackage(release.id, 'templates');
        vi.mocked(readTemplateTree).mockResolvedValue([
            { ...file, metadata: { ...file.metadata, ctimeMs: 2 } },
        ]);
        await service.savePackage(info.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('rejects a forged selection before allocating or changing files', async () => {
        index();
        const info = await service.getPackage(release.id, 'templates');
        await expect(
            service.savePackage(info.token, ['../outside']),
        ).rejects.toThrow('errors.package');
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(extractTemplateRange).not.toHaveBeenCalled();
    });
    it('preserves unrelated files added since opening the selector', async () => {
        index();
        const original = {
            relative: 'macos.zip',
            size: 1,
            hash: '',
            mode: 0o644,
        };
        vi.mocked(readTemplateTree).mockResolvedValue([original]);
        const info = await service.getPackage(release.id, 'templates');
        vi.mocked(readTemplateTree).mockResolvedValue([
            original,
            { ...original, relative: 'other.zip' },
        ]);
        await service.savePackage(info.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            [],
            ['macos.zip'],
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('cancels a partial download without committing additions or removals', async () => {
        index();
        const info = await service.getPackage(release.id, 'templates');
        vi.mocked(extractTemplateRange).mockImplementation(
            async (_zip, _entry, _destination, _relative, signal) =>
                new Promise<void>((_resolve, reject) => {
                    signal.addEventListener(
                        'abort',
                        () => reject(signal.reason),
                        { once: true },
                    );
                }),
        );
        await service.savePackage(info.token, ['macos.zip']);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('downloading'),
        );
        const job = (await service.getJobs()).at(-1);
        if (!job) throw new Error('Expected active job');
        await service.cancel(job.id);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('cancelled'),
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('rejects a changed remote archive and reloads its index on reopening', async () => {
        index();
        const info = await service.getPackage(release.id, 'templates');
        const original =
            await vi.mocked(openTemplateRange).mock.results[0].value;
        vi.mocked(openTemplateRange).mockResolvedValue({
            ...original,
            index: { ...original.index, fingerprint: 'changed' },
        });
        await service.savePackage(info.token, ['macos.zip']);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect((await service.getJobs()).at(-1)?.error).toBe(
            'exportTemplates:errors.changed',
        );
        expect(extractTemplateRange).not.toHaveBeenCalled();
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        await service.getPackage(release.id, 'templates');
        expect(openTemplateRange).toHaveBeenCalledTimes(3);
    });
    it('applies a removal-only selection without downloading an archive', async () => {
        index();
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'macos.zip', size: 1, hash: 'old', mode: 0o644 },
        ]);
        const info = await service.getPackage(release.id, 'templates');
        await service.savePackage(info.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(openTemplateRange).toHaveBeenCalledOnce();
        expect(extractTemplateRange).not.toHaveBeenCalled();
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            [],
            ['macos.zip'],
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it.each(['.DS_Store', 'Thumbs.db', '__MACOSX/._template'])(
        'removes hidden housekeeping %s when no selected templates remain',
        async (metadata) => {
            index();
            const files = ['macos.zip', metadata, 'version.txt'].map(
                (relative) => ({ relative, size: 1, hash: '', mode: 0o644 }),
            );
            vi.mocked(readTemplateTree).mockResolvedValue(files);
            const info = await service.getPackage(release.id, 'templates');
            vi.mocked(readTemplateTree)
                .mockResolvedValueOnce(files)
                .mockResolvedValueOnce([files[2]]);

            await service.savePackage(info.token, [metadata]);
            await vi.waitFor(async () =>
                expect((await service.getJobs()).at(-1)?.stage).toBe(
                    'complete',
                ),
            );

            expect(updateTemplateFiles).toHaveBeenNthCalledWith(
                1,
                expect.any(String),
                expect.any(String),
                [],
                ['macos.zip', metadata],
            );
            expect(updateTemplateFiles).toHaveBeenNthCalledWith(
                2,
                expect.any(String),
                expect.any(String),
                [],
                ['version.txt'],
            );
        },
    );
    it('preserves selected hidden files that are not housekeeping', async () => {
        index();
        const files = ['macos.zip', '.custom-template'].map((relative) => ({
            relative,
            size: 1,
            hash: '',
            mode: 0o644,
        }));
        vi.mocked(readTemplateTree).mockResolvedValue(files);
        const info = await service.getPackage(release.id, 'templates');
        await service.savePackage(info.token, ['.custom-template']);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            [],
            ['macos.zip'],
        );
    });
    /** Creates independent standard and .NET selections for queue scenarios. */
    async function queueSelections() {
        index();
        getCatalog.mockResolvedValue({
            releases: [
                {
                    ...release,
                    templateAssets: [
                        ...(release.templateAssets ?? []),
                        {
                            ...release.templateAssets?.[0],
                            id: 'mono-templates',
                            flavor: 'dotnet',
                        },
                    ],
                },
            ],
        });
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'macos.zip', size: 1, hash: 'old', mode: 0o644 },
        ]);
        return [
            await service.getPackage(release.id, 'templates'),
            await service.getPackage(release.id, 'mono-templates'),
        ];
    }
    it('runs queued editions sequentially and rejects a duplicate pending version', async () => {
        const [first, second] = await queueSelections();
        const gate = Promise.withResolvers<void>();
        vi.mocked(updateTemplateFiles)
            .mockResolvedValue(undefined)
            .mockReturnValueOnce(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(updateTemplateFiles).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        await expect(service.savePackage(first.token, [])).rejects.toThrow(
            'errors.busy',
        );
        expect((await service.getJobs()).map((job) => job.stage)).toEqual([
            'applying',
            'queued',
        ]);
        expect(updateTemplateFiles).toHaveBeenCalledOnce();
        gate.resolve();
        await vi.waitFor(async () =>
            expect((await service.getJobs()).map((job) => job.stage)).toEqual([
                'complete',
                'complete',
            ]),
        );
        expect(updateTemplateFiles).toHaveBeenCalledTimes(2);
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('cancels a queued entry without touching the active operation', async () => {
        const [first, second] = await queueSelections();
        const gate = Promise.withResolvers<void>();
        vi.mocked(updateTemplateFiles).mockReturnValue(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(updateTemplateFiles).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        const queued = (await service.getJobs()).find(
            (job) => job.stage === 'queued',
        );
        if (!queued) throw new Error('Expected queued entry');
        await service.cancel(queued.id);
        expect(await service.getJobs()).toHaveLength(1);
        gate.resolve();
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateTemplateFiles).toHaveBeenCalledOnce();
    });
    it('refuses cancellation after the final commit starts', async () => {
        const [first] = await queueSelections();
        const gate = Promise.withResolvers<void>();
        vi.mocked(updateTemplateFiles).mockResolvedValue(undefined);
        vi.mocked(updateTemplateFiles).mockReturnValue(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('applying'),
        );
        const job = (await service.getJobs()).at(-1);
        if (!job) throw new Error('Expected applying entry');
        await expect(service.cancel(job.id)).rejects.toThrow('errors.busy');
        gate.resolve();
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
    });
    it('pauses queued work for recovery and resumes after recovery completes', async () => {
        const [first, second] = await queueSelections();
        const gate = Promise.withResolvers<void>();
        vi.mocked(updateTemplateFiles)
            .mockResolvedValue(undefined)
            .mockReturnValueOnce(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(updateTemplateFiles).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        const job = (await service.getJobs()).find(
            (item) => item.stage === 'applying',
        );
        if (!job) throw new Error('Expected active entry');
        const directoryStat = {
            isDirectory: () => true,
            isSymbolicLink: () => false,
        } as fs.Stats;
        vi.mocked(templateLstat).mockResolvedValue(directoryStat);
        vi.mocked(fs.promises.readdir).mockResolvedValue([job.id] as never);
        gate.reject(new Error('exportTemplates:errors.recovery'));
        await vi.waitFor(async () =>
            expect((await service.getJobs()).map((item) => item.stage)).toEqual(
                ['error', 'queued'],
            ),
        );
        expect(updateTemplateFiles).toHaveBeenCalledOnce();
        vi.mocked(readTemplateJournal).mockResolvedValue({
            version: 2,
            phase: 'committing',
            sets: [],
        });
        vi.mocked(recoverTemplateTransaction).mockImplementation(async () => {
            vi.mocked(templateLstat).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readdir).mockResolvedValue(undefined);
        });
        await service.recover(job.id);
        await vi.waitFor(() =>
            expect(updateTemplateFiles).toHaveBeenCalledTimes(2),
        );
        await vi.waitFor(async () =>
            expect((await service.getJobs())[1].stage).toBe('complete'),
        );
    });
});

describe('project migration assessment and preference', () => {
    const project = {
        path: path.resolve('assessment-game'),
        name: 'Assessment game',
        launch_path: path.resolve('assessment-editor', 'Godot'),
        release: { source: 'official', version: '4.4-stable' },
    } as ProjectDetails;
    beforeEach(() => {
        list.mockResolvedValue([project]);
        vi.mocked(assessProjectTemplates).mockImplementation(async (item) => ({
            projectPath: item.path,
            name: item.name,
            mode: item.exportTemplateMode,
            state:
                item.exportTemplateMode === 'separate' ? 'separate' : 'ready',
            reason:
                item.exportTemplateMode === 'separate'
                    ? 'kept-separate'
                    : 'empty',
            pending: item.exportTemplateMode !== 'separate',
            compared: false,
            provenance: 'unverified',
            setIds: [],
            metadata: [],
            unexpected: [],
        }));
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        updateProjects.mockImplementation(async (mutator) => {
            const projects = await mutator(await list());
            list.mockResolvedValue(projects);
            return projects;
        });
    });
    it('discovers without hashes, then compares only an explicitly selected registered project', async () => {
        expect(await service.getMigrationAssessment()).toMatchObject({
            pendingCount: 1,
        });
        expect(assessProjectTemplates).toHaveBeenLastCalledWith(
            project,
            path.resolve('fixture-shared'),
        );
        await service.inspectProjectTemplates(project.path);
        expect(assessProjectTemplates).toHaveBeenLastCalledWith(
            project,
            path.resolve('fixture-shared'),
            true,
            expect.any(AbortSignal),
        );
        await expect(
            service.inspectProjectTemplates('unregistered'),
        ).rejects.toThrow('errors.connection');
        expect(updateProjects).not.toHaveBeenCalled();
    });
});

describe('project export template settings', () => {
    const project = {
        path: path.resolve('settings-project'),
        name: 'Settings project',
        launch_path: path.resolve('settings-editor', 'Godot'),
        release: { source: 'official', version: '4.4-stable', mono: false },
        exportTemplateMode: 'separate',
    } as ProjectDetails;
    beforeEach(() => {
        list.mockResolvedValue([project]);
        vi.mocked(fs.promises.realpath).mockImplementation(async (filename) =>
            String(filename),
        );
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        vi.mocked(fs.promises.readdir).mockResolvedValue([]);
        updateProjects.mockImplementation(async (mutator) =>
            mutator([project]),
        );
    });
    it('captures central Official files from project settings', async () => {
        await service.getProjectPackage(project.path, true);
        expect(readTemplateTree).toHaveBeenCalledWith(
            path.join(path.resolve('fixture-shared'), '4.4.stable'),
            false,
            undefined,
            true,
        );
        expect(openTemplateRange).not.toHaveBeenCalled();
    });
    it('loads the selected version from central Official storage', async () => {
        await service.getProjectPackage(project.path, true, '4.5.stable.mono');
        expect(readTemplateTree).toHaveBeenCalledWith(
            path.join(path.resolve('fixture-shared'), '4.5.stable.mono'),
            false,
            undefined,
            true,
        );
    });
    it('lists only the selected editor version without reading file contents', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.5.stable.mono',
            '.DS_Store',
        ] as never);
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'linux_debug.x86_64', size: 10, mode: 0o644 },
        ]);
        const settings = await service.getProjectSettings(
            project.path,
            '4.6.stable',
        );
        expect(settings.setId).toBe('4.6.stable');
        expect(settings.sets.map((set) => set.id)).toEqual(['4.6.stable']);
        expect(
            vi
                .mocked(readTemplateTree)
                .mock.calls.every(([, hash]) => hash === false),
        ).toBe(true);
    });
    it('checks completeness only for imported builds matching the selected version', async () => {
        vi.mocked(readImportedTemplates).mockResolvedValue({
            schemaVersion: 1,
            builds: [
                { id: 'incomplete', setId: '4.4.stable' },
                { id: 'other', setId: '4.5.stable' },
            ],
        } as never);
        importedMocks.isBuildAvailable.mockResolvedValue(false);

        const settings = await service.getProjectSettings(project.path);

        expect(settings.importedBuilds).toEqual([
            { id: 'incomplete', setId: '4.4.stable', available: false },
        ]);
        expect(importedMocks.isBuildAvailable).toHaveBeenCalledOnce();
        expect(importedMocks.isBuildAvailable).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'incomplete' }),
        );
    });
    it('rejects version paths outside the project collection', async () => {
        await expect(
            service.getProjectPackage(project.path, true, '../outside'),
        ).rejects.toThrow('errors.identity');
        await expect(
            service.getProjectSettings(project.path, '../outside'),
        ).rejects.toThrow('errors.identity');
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('keeps custom editor builds out of official downloads', async () => {
        list.mockResolvedValue([
            { ...project, release: { ...project.release, source: 'custom' } },
        ]);
        await expect(service.getProjectPackage(project.path)).rejects.toThrow();
    });
    it('rejects a queued reconnection if the project editor changed after the choice', async () => {
        list.mockResolvedValueOnce([project]).mockResolvedValue([
            {
                ...project,
                release: { ...project.release, version: '4.5-stable' },
            },
        ]);
        await service.prepareMigration(project.path, 'use-shared');
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('error'),
        );
        expect((await service.getJobs()).at(-1)?.error).toBe(
            'exportTemplates:errors.changed',
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
    });
    it('allows an explicit reconnection and clears the saved opt-out after success', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        await service.prepareMigration(project.path, 'share-project');
        await vi.waitFor(async () =>
            expect((await service.getJobs()).at(-1)?.stage).toBe('complete'),
        );
        expect(updateProjects).toHaveBeenCalledOnce();
        const saved = await updateProjects.mock.calls[0][0]([project]);
        expect(saved[0].exportTemplateMode).toBe('shared');
    });
});

vi.mock('./imported-templates.store.js', () => ({
    importedTemplateFiles: vi.fn(
        (build: { setId: string; directoryName: string }) =>
            path.resolve(
                'fixture-imports',
                'imported',
                build.setId,
                build.directoryName,
            ),
    ),
    readImportedTemplates: vi.fn(async () => ({
        schemaVersion: 1,
        builds: [],
        defaults: {},
    })),
    resolveImportedTemplate: vi.fn(),
}));
vi.mock('./template-projection.util.js', () => ({
    projectTemplateBuilds: vi.fn(),
}));

vi.mock('./imported-templates.service.js', () => ({
    ImportedTemplatesService: class {
        synchronise = importedMocks.synchronise;
        cleanupAbandonedPreviews = importedMocks.cleanupAbandonedPreviews;
        saveProject = importedMocks.saveProject;
        recoverSavedProjects = importedMocks.recoverSavedProjects;
        remove = importedMocks.remove;
        isBuildAvailable = importedMocks.isBuildAvailable;
    },
}));
vi.mock('./template-paths.util.js', () => ({
    projectOfficialTemplateRoot: (editor: string) =>
        path.join(editor, 'editor_data', 'export_templates'),
}));
