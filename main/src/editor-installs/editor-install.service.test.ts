import type { ReleaseInstallProgress, ReleaseSummary } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorInstallService } from './editor-install.service.js';

const fsMocks = vi.hoisted(() => ({
    promises: {
        mkdir: vi.fn(),
        rm: vi.fn(),
    },
}));

vi.mock('node:fs', () => fsMocks);

vi.mock('node:os', () => ({
    platform: () => 'linux',
    arch: () => 'x64',
}));

const integrityMocks = vi.hoisted(() => ({
    isSafePathSegment: vi.fn(() => true),
    resolveArchiveIntegrity: vi.fn(),
}));
vi.mock('../utils/archive-integrity.util.js', () => integrityMocks);

const extractionMocks = vi.hoisted(() => ({
    extractEditorArchive: vi.fn(),
}));
vi.mock('../utils/editor-archive-extraction.adapter.js', () => extractionMocks);

const validationMocks = vi.hoisted(() => ({
    validateExtractedEditor: vi.fn(),
}));
vi.mock('../utils/editor-install-containment.util.js', () => ({
    ...validationMocks,
    EditorInstallValidationError: class extends Error {
        reason = 'invalid-editor';
    },
}));

const releasesMocks = vi.hoisted(() => ({
    downloadReleaseAsset: vi.fn(),
    getPlatformAsset: vi.fn((_, __, assets) => assets),
}));
vi.mock('../utils/releases.utils.js', () => releasesMocks);

const preferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));
vi.mock('../commands/userPreferences.js', () => preferencesMocks);

vi.mock('../utils/godot.utils.js', () => ({
    DEFAULT_PROJECT_DEFINITION: {},
    getProjectDefinition: () => ({ configVersion: 5 }),
}));

vi.mock('../i18n/index.js', () => ({ t: (key: string) => key }));

describe('EditorInstallService', () => {
    const installedEditors = {
        addInstalledEditor: vi.fn(),
        revalidateInstalledEditors: vi.fn(),
    };
    const editorCatalog = { getCatalog: vi.fn() };
    const projectRepair = {
        revalidateProjects: vi.fn(),
        repairAfterReinstall: vi.fn(),
    };
    const progressService = { publish: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.promises.mkdir.mockResolvedValue(undefined);
        fsMocks.promises.rm.mockResolvedValue(undefined);
        integrityMocks.resolveArchiveIntegrity.mockResolvedValue({
            algorithm: 'sha256',
            digest: 'a'.repeat(64),
        });
        extractionMocks.extractEditorArchive.mockResolvedValue(undefined);
        validationMocks.validateExtractedEditor.mockResolvedValue(undefined);
        preferencesMocks.getUserPreferences.mockResolvedValue({
            install_location: '/installs',
        });
        releasesMocks.downloadReleaseAsset.mockResolvedValue(undefined);
        installedEditors.addInstalledEditor.mockResolvedValue([]);
        projectRepair.revalidateProjects.mockResolvedValue(undefined);
    });

    it('runs distinct installs serially and continues after failure', async () => {
        const firstDownload = deferred<void>();
        releasesMocks.downloadReleaseAsset
            .mockReturnValueOnce(firstDownload.promise)
            .mockRejectedValueOnce(new Error('network failure'));
        const service = createService();

        const first = service.installEditor(
            createRelease('4.3-stable'),
            false,
            'project',
        );
        const second = service.installEditor(
            createRelease('4.4-stable'),
            false,
            'project',
        );
        await waitFor(
            () => releasesMocks.downloadReleaseAsset.mock.calls.length === 1,
        );

        firstDownload.resolve();
        await expect(first).resolves.toMatchObject({ success: true });
        await expect(second).resolves.toMatchObject({
            success: false,
            error: 'network failure',
        });
        expect(releasesMocks.downloadReleaseAsset).toHaveBeenCalledTimes(2);
    });

    it('deduplicates matching requests and disables cancellation when a project joins', async () => {
        const download = abortableDownload();
        releasesMocks.downloadReleaseAsset.mockImplementation(download.run);
        const service = createService();
        const release = createRelease('4.3-stable');

        const userResult = service.installEditor(release, false, 'installs');
        await waitForStage('downloading');
        const projectResult = service.installEditor(release, false, 'project');
        const latest = latestProgress('4.3-stable');

        expect(latest.canCancel).toBe(false);
        await expect(service.cancelInstall(latest.id)).resolves.toEqual({
            jobId: latest.id,
            status: 'not-cancellable',
        });
        download.resolve();
        await expect(userResult).resolves.toMatchObject({ success: true });
        await expect(projectResult).resolves.toMatchObject({ success: true });
        expect(releasesMocks.downloadReleaseAsset).toHaveBeenCalledOnce();
    });

    it('cancels a queued user install and republishes remaining positions', async () => {
        const activeDownload = abortableDownload();
        releasesMocks.downloadReleaseAsset.mockImplementation(
            activeDownload.run,
        );
        const service = createService();

        const active = service.installEditor(
            createRelease('4.3-stable'),
            false,
            'project',
        );
        await waitForStage('downloading');
        const cancelled = service.installEditor(
            createRelease('4.4-stable'),
            false,
            'installs',
        );
        const remaining = service.installEditor(
            createRelease('4.5-stable'),
            false,
            'installs',
        );
        const queued = latestProgress('4.4-stable');

        await expect(service.cancelInstall(queued.id)).resolves.toEqual({
            jobId: queued.id,
            status: 'cancelled',
        });
        await expect(cancelled).resolves.toMatchObject({
            success: false,
            cancelled: true,
        });
        expect(latestProgress('4.5-stable').queuePosition).toBe(1);

        activeDownload.resolve();
        await active;
        await remaining;
    });

    it('cancels an active user download without touching the existing destination', async () => {
        const download = abortableDownload();
        releasesMocks.downloadReleaseAsset.mockImplementation(download.run);
        const service = createService();
        const result = service.installEditor(
            createRelease('4.3-stable'),
            false,
            'installs',
        );
        await waitForStage('downloading');
        const progress = latestProgress('4.3-stable');

        await expect(service.cancelInstall(progress.id)).resolves.toEqual({
            jobId: progress.id,
            status: 'cancelling',
        });
        await expect(result).resolves.toMatchObject({
            success: false,
            cancelled: true,
        });
        await expect(result).resolves.not.toHaveProperty('error');
        expect(latestProgress('4.3-stable')).toMatchObject({
            stage: 'cancelled',
            canCancel: false,
        });
        expect(fsMocks.promises.rm).not.toHaveBeenCalledWith(
            '/installs/4.3-stable',
            expect.anything(),
        );
        expect(installedEditors.addInstalledEditor).not.toHaveBeenCalled();
        expect(projectRepair.revalidateProjects).not.toHaveBeenCalled();
    });

    it('starts a fresh non-cancellable project job when cancellation wins the join race', async () => {
        const firstDownload = abortableDownload();
        releasesMocks.downloadReleaseAsset
            .mockImplementationOnce(firstDownload.run)
            .mockResolvedValueOnce(undefined);
        const service = createService();
        const release = createRelease('4.3-stable');
        const userResult = service.installEditor(release, false, 'installs');
        await waitForStage('downloading');
        const jobId = latestProgress(release.version).id;

        await service.cancelInstall(jobId);
        const projectResult = service.installEditor(release, false, 'project');

        await expect(userResult).resolves.toMatchObject({ cancelled: true });
        await expect(projectResult).resolves.toMatchObject({ success: true });
        expect(releasesMocks.downloadReleaseAsset).toHaveBeenCalledTimes(2);
        expect(
            progressService.publish.mock.calls
                .map(([progress]) => progress as ReleaseInstallProgress)
                .filter((progress) => progress.version === release.version)
                .at(-2),
        ).toMatchObject({ canCancel: false });
    });

    it('closes cancellation before extraction begins', async () => {
        const extraction = deferred<void>();
        extractionMocks.extractEditorArchive.mockReturnValue(
            extraction.promise,
        );
        const service = createService();
        const result = service.installEditor(
            createRelease('4.3-stable'),
            false,
            'installs',
        );
        await waitForStage('extracting');
        const progress = latestProgress('4.3-stable');

        expect(progress.canCancel).toBe(false);
        await expect(service.cancelInstall(progress.id)).resolves.toEqual({
            jobId: progress.id,
            status: 'not-cancellable',
        });
        extraction.resolve();
        await expect(result).resolves.toMatchObject({ success: true });
    });

    it('publishes download progress at most five times per second', async () => {
        let now = 1_000;
        const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
        releasesMocks.downloadReleaseAsset.mockImplementation(
            async (...args) => {
                const options = args[2] as {
                    onProgress: (progress: {
                        receivedBytes: number;
                        totalBytes?: number;
                    }) => void;
                };
                options.onProgress({ receivedBytes: 10, totalBytes: 100 });
                now += 199;
                options.onProgress({ receivedBytes: 20, totalBytes: 100 });
                now += 1;
                options.onProgress({ receivedBytes: 30, totalBytes: 100 });
                now += 200;
                options.onProgress({ receivedBytes: 40, totalBytes: 100 });
            },
        );
        const service = createService();

        await expect(
            service.installEditor(
                createRelease('4.3-stable'),
                false,
                'installs',
            ),
        ).resolves.toMatchObject({ success: true });
        dateNow.mockRestore();

        const downloadProgress = progressService.publish.mock.calls
            .map(([progress]) => progress as ReleaseInstallProgress)
            .filter((progress) => progress.stage === 'downloading');
        expect(downloadProgress).toHaveLength(3);
        expect(
            downloadProgress.map(({ receivedBytes }) => receivedBytes),
        ).toEqual([0, 30, 40]);
    });

    /** Creates a service with isolated dependency mocks. */
    function createService(): EditorInstallService {
        return new EditorInstallService(
            installedEditors as never,
            editorCatalog as never,
            projectRepair as never,
            progressService as never,
        );
    }

    /** Waits until any install publishes the requested stage. */
    async function waitForStage(stage: ReleaseInstallProgress['stage']) {
        await waitFor(() =>
            progressService.publish.mock.calls.some(
                ([progress]) => progress.stage === stage,
            ),
        );
    }

    /** Gets the latest progress snapshot for one release. */
    function latestProgress(version: string): ReleaseInstallProgress {
        const progress = progressService.publish.mock.calls
            .map(([value]) => value as ReleaseInstallProgress)
            .filter((value) => value.version === version)
            .at(-1);
        if (!progress) {
            throw new Error(`No progress published for ${version}`);
        }
        return progress;
    }
});

/** Creates a release with one Linux Standard asset. */
function createRelease(version: string): ReleaseSummary {
    return {
        version,
        version_number: Number.parseFloat(version),
        name: `Godot ${version}`,
        published_at: '2026-01-01T00:00:00Z',
        draft: false,
        prerelease: false,
        assets: [
            {
                name: `Godot_${version}_linux.x86_64.zip`,
                download_url: `https://example.com/${version}.zip`,
                digest: `sha256:${'a'.repeat(64)}`,
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
        ],
    };
}

/** Creates a promise whose resolution is controlled by a test. */
function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

/** Creates a download mock that rejects with the caller's abort reason. */
function abortableDownload() {
    const operation = deferred<void>();
    return {
        resolve: () => operation.resolve(),
        run: vi.fn(
            (_asset, _path, options: { signal?: AbortSignal }) =>
                new Promise<void>((resolve, reject) => {
                    operation.promise.then(resolve, reject);
                    options.signal?.addEventListener(
                        'abort',
                        () => reject(options.signal?.reason),
                        { once: true },
                    );
                }),
        ),
    };
}

/** Waits for a condition driven by promise microtasks. */
async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (condition()) {
            return;
        }
        await Promise.resolve();
    }
    throw new Error('Timed out waiting for test condition');
}
