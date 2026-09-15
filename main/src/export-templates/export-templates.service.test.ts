import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EditorCatalogRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';
import type { ProjectsStore } from '../projects/projects.store.js';
import { resolveArchiveIntegrity } from '../utils/archive-integrity.util.js';
import { downloadReleaseAsset } from '../utils/releases.utils.js';
import { ExportTemplatesService } from './export-templates.service.js';
import type { TemplateArchiveAdapter } from './template-archive.adapter.js';
import {
    extractTemplateRange,
    openTemplateRange,
} from './template-range.adapter.js';

const extractTemplateArchive = vi.fn();

import {
    readTemplateTree,
    templateConnectionStatus,
    templateFingerprint,
    templateLstat,
} from './template-files.util.js';

import {
    commitTemplateTransaction,
    readTemplateJournal,
    recoverTemplateTransaction,
    stageTemplateSets,
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
    },
}));
vi.mock('electron', () => ({ dialog: {}, shell: {} }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));
vi.mock('../utils/archive-integrity.util.js', () => ({
    resolveArchiveIntegrity: vi.fn(),
}));
vi.mock('../utils/releases.utils.js', () => ({
    downloadReleaseAsset: vi.fn(),
}));
vi.mock('./template-archive.adapter.js', () => ({
    TemplateArchiveAdapter: class {},
}));
vi.mock('./template-runtime.util.js', () => ({
    getSharedTemplateRoot: () => path.resolve('fixture-shared'),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    checkTemplateCapacity: vi.fn(),
    templateLstat: vi.fn(),
    readTemplateTree: vi.fn(),
    templateConnectionStatus: vi.fn(),
}));

vi.mock('./template-transaction.util.js', async (load) => ({
    ...(await load<typeof import('./template-transaction.util.js')>()),
    stageTemplateSets: vi.fn(),
    commitTemplateTransaction: vi.fn(),
    readTemplateJournal: vi.fn(),
    recoverTemplateTransaction: vi.fn(),
}));
const list = vi.fn();
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
beforeEach(() => {
    vi.resetAllMocks();
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
        { list } as unknown as ProjectsStore,
        {
            extract: extractTemplateArchive,
        } as unknown as TemplateArchiveAdapter,
    );
});

describe('export template downloads', () => {
    it('resolves a catalogue package and checks integrity before offering a merge', async () => {
        await service.download(release.id, 'templates');
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('review'),
        );
        expect(resolveArchiveIntegrity).toHaveBeenCalledWith(
            expect.objectContaining({
                download_url: release.templateAssets?.[0].downloadUrl,
                digest: `sha256:${'a'.repeat(64)}`,
            }),
            expect.objectContaining({
                expectedReleaseTag: '4.4-stable',
                signal: expect.any(AbortSignal),
            }),
        );
        expect(downloadReleaseAsset).toHaveBeenCalledOnce();
        expect((await service.getJob())?.review?.sets).toEqual(['4.4.stable']);
    });
    it('rejects an unknown asset without downloading a renderer-supplied URL', async () => {
        await service.download(release.id, 'https://untrusted.invalid/package');
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('error'),
        );
        expect(downloadReleaseAsset).not.toHaveBeenCalled();
        expect((await service.getJob())?.error).toBe(
            'exportTemplates:errors.package',
        );
    });
    it('never extracts a download that fails integrity verification', async () => {
        vi.mocked(downloadReleaseAsset).mockRejectedValue(
            new Error('Checksum mismatch'),
        );
        await service.download(release.id, 'templates');
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('error'),
        );
        expect(extractTemplateArchive).not.toHaveBeenCalled();
        expect(fs.promises.rm).toHaveBeenCalled();
    });
    it('rejects a package whose full version or edition differs from the selected release', async () => {
        vi.mocked(extractTemplateArchive).mockResolvedValue({
            identity: '4.4.stable.mono',
            contents: path.resolve('extracted'),
        });
        await service.download(release.id, 'templates');
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('error'),
        );
        expect((await service.getJob())?.error).toBe(
            'exportTemplates:errors.identity',
        );
        expect(readTemplateTree).not.toHaveBeenCalled();
    });
    it('allows one job and cancels a running download before extraction', async () => {
        vi.mocked(downloadReleaseAsset).mockImplementation(
            (_asset, _file, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                        { once: true },
                    );
                }),
        );
        await service.download(release.id, 'templates');
        await vi.waitFor(() =>
            expect(downloadReleaseAsset).toHaveBeenCalledOnce(),
        );
        await expect(service.download(release.id, 'templates')).rejects.toThrow(
            'busy',
        );
        const job = await service.getJob();
        if (!job) throw new Error('Expected a download job');
        await service.cancel(job.id);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('cancelled'),
        );
        expect(extractTemplateArchive).not.toHaveBeenCalled();
    });
});

describe('template migration preparation', () => {
    it('reuses per-set hashes and preserves full paths for the final local-folder check', async () => {
        const project = {
            path: path.resolve('project'),
            name: 'Project',
            launch_path: path.resolve('editor', 'Godot'),
            release: { source: 'official', version: '4.4-stable', mono: false },
        } as ProjectDetails;
        list.mockResolvedValue([project]);
        vi.mocked(templateConnectionStatus).mockResolvedValue('local');
        vi.mocked(fs.promises.readdir).mockResolvedValue([
            '4.4.stable',
            '4.4.stable.mono',
        ] as never);
        const local = path.join(
            path.dirname(project.launch_path),
            'editor_data',
            'export_templates',
        );
        const file = {
            relative: 'nested/template',
            hash: 'a',
            size: 20,
            mode: 0o644,
        };
        vi.mocked(readTemplateTree).mockImplementation(async (directory) =>
            directory.startsWith(local + path.sep) ? [file] : [],
        );
        await service.prepareMigration(project.path);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('review'),
        );
        expect(readTemplateTree).toHaveBeenCalledTimes(4);
        expect(readTemplateTree).not.toHaveBeenCalledWith(
            local,
            true,
            expect.anything(),
        );
        vi.mocked(stageTemplateSets).mockResolvedValue([]);
        const job = await service.getJob();
        if (!job) throw new Error('Expected a migration job');
        await service.apply(job.id, {});
        await vi.waitFor(() =>
            expect(commitTemplateTransaction).toHaveBeenCalled(),
        );
        expect(commitTemplateTransaction).toHaveBeenCalledWith(
            path.resolve('fixture-shared'),
            expect.any(String),
            expect.objectContaining({
                version: 2,
                sourceHash: templateFingerprint([
                    { ...file, relative: `4.4.stable/${file.relative}` },
                    { ...file, relative: `4.4.stable.mono/${file.relative}` },
                ]),
            }),
            local,
            path.resolve('fixture-shared'),
        );
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
                undefined,
                root,
            );
            await service.download(release.id, 'templates');
            await vi.waitFor(async () =>
                expect((await service.getJob())?.stage).toBe('review'),
            );
        },
    );

    it('resolves the registered project for a legacy journal without a saved location', async () => {
        const root = path.resolve('fixture-shared');
        const id = '11111111-1111-1111-1111-111111111111';
        const directory = path.join(
            path.dirname(root),
            '.godot-launcher-template-work',
            id,
        );
        const projectPath = path.resolve('project');
        const launchPath = path.resolve('editor', 'Godot');
        list.mockResolvedValue([
            {
                path: projectPath,
                release: {
                    source: 'official',
                    version: '4.4-stable',
                    mono: false,
                },
                launch_path: launchPath,
            },
        ]);
        vi.mocked(templateLstat).mockResolvedValue({
            isDirectory: () => true,
            isSymbolicLink: () => false,
        } as fs.Stats);
        vi.mocked(fs.promises.readdir).mockResolvedValue([id] as never);
        vi.mocked(readTemplateJournal).mockResolvedValue({
            phase: 'committing',
            projectPath,
            sourceHash: templateFingerprint([], 1),
            sets: [],
        });

        await service.recover(id);

        expect(recoverTemplateTransaction).toHaveBeenCalledWith(
            root,
            directory,
            path.join(
                path.dirname(launchPath),
                'editor_data',
                'export_templates',
            ),
            root,
        );
    });
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
    it('rejects a forged selection before allocating or changing files', async () => {
        index();
        const info = await service.getPackage(release.id, 'templates');
        await expect(
            service.savePackage(info.token, ['../outside']),
        ).rejects.toThrow('errors.package');
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(extractTemplateRange).not.toHaveBeenCalled();
    });
    it('rejects a changed local snapshot before downloading or removing anything', async () => {
        index();
        const info = await service.getPackage(release.id, 'templates');
        vi.mocked(readTemplateTree).mockResolvedValue([
            { relative: 'other.zip', size: 1, hash: 'changed', mode: 0o644 },
        ]);
        await service.savePackage(info.token, ['macos.zip']);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('error'),
        );
        expect((await service.getJob())?.error).toBe(
            'exportTemplates:errors.changed',
        );
        expect(extractTemplateRange).not.toHaveBeenCalled();
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
            expect((await service.getJob())?.stage).toBe('downloading'),
        );
        const job = await service.getJob();
        if (!job) throw new Error('Expected active job');
        await service.cancel(job.id);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('cancelled'),
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
        expect(stageTemplateSets).not.toHaveBeenCalled();
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
            expect((await service.getJob())?.stage).toBe('error'),
        );
        expect((await service.getJob())?.error).toBe(
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
        vi.mocked(stageTemplateSets).mockResolvedValue([]);
        await service.savePackage(info.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('complete'),
        );
        expect(openTemplateRange).toHaveBeenCalledOnce();
        expect(extractTemplateRange).not.toHaveBeenCalled();
        expect(stageTemplateSets).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            [expect.objectContaining({ removed: ['macos.zip'] })],
            {},
            expect.any(AbortSignal),
        );
        expect(commitTemplateTransaction).toHaveBeenCalledOnce();
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
        const gate = Promise.withResolvers<[]>();
        vi.mocked(stageTemplateSets)
            .mockResolvedValue([])
            .mockReturnValueOnce(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(stageTemplateSets).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        await expect(service.savePackage(first.token, [])).rejects.toThrow(
            'errors.busy',
        );
        expect((await service.getJobs()).map((job) => job.stage)).toEqual([
            'preparing',
            'queued',
        ]);
        expect(stageTemplateSets).toHaveBeenCalledOnce();
        gate.resolve([]);
        await vi.waitFor(async () =>
            expect((await service.getJobs()).map((job) => job.stage)).toEqual([
                'complete',
                'complete',
            ]),
        );
        expect(stageTemplateSets).toHaveBeenCalledTimes(2);
        expect(commitTemplateTransaction).toHaveBeenCalledTimes(2);
    });
    it('cancels a queued entry without touching the active operation', async () => {
        const [first, second] = await queueSelections();
        const gate = Promise.withResolvers<[]>();
        vi.mocked(stageTemplateSets).mockReturnValue(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(stageTemplateSets).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        const queued = (await service.getJobs()).find(
            (job) => job.stage === 'queued',
        );
        if (!queued) throw new Error('Expected queued entry');
        await service.cancel(queued.id);
        expect(await service.getJobs()).toHaveLength(1);
        gate.resolve([]);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('complete'),
        );
        expect(stageTemplateSets).toHaveBeenCalledOnce();
    });
    it('cancels temporary staging before the installed collection is changed', async () => {
        const [first] = await queueSelections();
        const gate = Promise.withResolvers<[]>();
        vi.mocked(stageTemplateSets).mockReturnValue(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(stageTemplateSets).toHaveBeenCalledOnce(),
        );
        const job = await service.getJob();
        if (!job) throw new Error('Expected active entry');
        await service.cancel(job.id);
        gate.resolve([]);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('cancelled'),
        );
        expect(commitTemplateTransaction).not.toHaveBeenCalled();
    });
    it('refuses cancellation after the final commit starts', async () => {
        const [first] = await queueSelections();
        const gate = Promise.withResolvers<void>();
        vi.mocked(stageTemplateSets).mockResolvedValue([]);
        vi.mocked(commitTemplateTransaction).mockReturnValue(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('applying'),
        );
        const job = await service.getJob();
        if (!job) throw new Error('Expected applying entry');
        await expect(service.cancel(job.id)).rejects.toThrow('errors.busy');
        gate.resolve();
        await vi.waitFor(async () =>
            expect((await service.getJob())?.stage).toBe('complete'),
        );
    });
    it('pauses queued work for recovery and resumes after recovery completes', async () => {
        const [first, second] = await queueSelections();
        const gate = Promise.withResolvers<[]>();
        vi.mocked(stageTemplateSets)
            .mockResolvedValue([])
            .mockReturnValueOnce(gate.promise);
        await service.savePackage(first.token, []);
        await vi.waitFor(() =>
            expect(stageTemplateSets).toHaveBeenCalledOnce(),
        );
        await service.savePackage(second.token, []);
        const job = await service.getJob();
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
        expect(stageTemplateSets).toHaveBeenCalledOnce();
        vi.mocked(readTemplateJournal).mockResolvedValue({
            version: 2,
            phase: 'committing',
            sets: [],
        });
        vi.mocked(recoverTemplateTransaction).mockImplementation(async () => {
            vi.mocked(templateLstat).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readdir).mockResolvedValue([]);
        });
        await service.recover(job.id);
        await vi.waitFor(() =>
            expect(stageTemplateSets).toHaveBeenCalledTimes(2),
        );
        await vi.waitFor(async () =>
            expect((await service.getJobs())[1].stage).toBe('complete'),
        );
    });
});
