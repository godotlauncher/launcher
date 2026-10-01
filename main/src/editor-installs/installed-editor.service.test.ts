import * as path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstalledEditorService } from './installed-editor.service.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    promises: {
        access: vi.fn(),
        rm: vi.fn(),
    },
}));
vi.mock('node:fs', () => fsMocks);

const osMocks = vi.hoisted(() => ({ platform: vi.fn(() => 'linux') }));
vi.mock('node:os', () => osMocks);

const spawnMocks = vi.hoisted(() => ({
    spawn: vi.fn(() => ({ unref: vi.fn() })),
}));
vi.mock('node:child_process', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:child_process')>()),
    ...spawnMocks,
}));

vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: {
            on: vi.fn(),
            logger: null,
            channel: null,
            checkForUpdates: vi.fn(),
            checkForUpdatesAndNotify: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            setFeedURL: vi.fn(),
            addAuthHeader: vi.fn(),
            isUpdaterActive: vi.fn(),
            currentVersion: '1.0.0',
        },
    },
    UpdateCheckResult: {},
}));

const manifestMocks = vi.hoisted(() => ({
    parseCustomEngineManifest: vi.fn(),
}));
vi.mock('../utils/customEngineManifest.utils.js', () => manifestMocks);
vi.mock('../i18n/index.js', () => ({ t: (key: string) => key }));

describe('InstalledEditorService', () => {
    const store = {
        list: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        replace: vi.fn(),
    };
    const configService = { get: vi.fn(() => false) };
    const projectRepair = {
        removeEditorFromProjects: vi.fn(),
        revalidateProjects: vi.fn(),
        getProjectsUsingEditor: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        configService.get.mockReturnValue(false);
        store.list.mockResolvedValue([]);
        store.put.mockResolvedValue([]);
        store.remove.mockResolvedValue([]);
        store.replace.mockImplementation(async (releases) => releases);
        projectRepair.removeEditorFromProjects.mockResolvedValue(undefined);
        projectRepair.revalidateProjects.mockResolvedValue(undefined);
        projectRepair.getProjectsUsingEditor.mockResolvedValue([]);
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.promises.access.mockResolvedValue(undefined);
        fsMocks.promises.rm.mockResolvedValue(undefined);
        osMocks.platform.mockReturnValue('linux');
    });

    it('revalidates and persists every registered editor', async () => {
        const valid = createRelease('4.3-stable');
        const invalid = createRelease('4.4-stable');
        store.list.mockResolvedValue([valid, invalid]);
        fsMocks.promises.access
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('missing'));
        const service = createService();

        const releases = await service.revalidateInstalledEditors();

        expect(releases).toEqual([
            expect.objectContaining({ version: '4.3-stable', valid: true }),
            expect.objectContaining({ version: '4.4-stable', valid: false }),
        ]);
        expect(store.replace).toHaveBeenCalledWith(releases);
    });

    it('publishes quick health only when editor validity changes', async () => {
        const valid = createRelease('4.3-stable');
        const missing = createRelease('4.4-stable');
        store.list.mockResolvedValue([valid, missing]);
        fsMocks.promises.access
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('missing'));
        const service = createService();

        await expect(service.refreshInstalledEditorHealth()).resolves.toEqual([
            expect.objectContaining({ version: '4.3-stable', valid: true }),
            expect.objectContaining({ version: '4.4-stable', valid: false }),
        ]);
        expect(store.replace).toHaveBeenCalledOnce();

        store.replace.mockClear();
        store.list.mockResolvedValue([valid, { ...missing, valid: false }]);
        fsMocks.promises.access
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('missing'));

        await expect(
            service.refreshInstalledEditorHealth(),
        ).resolves.toBeNull();
        expect(store.replace).not.toHaveBeenCalled();
    });

    it('rejects a duplicate custom editor unless replacement is explicit', async () => {
        const custom = createRelease('studio-build', { source: 'custom' });
        manifestMocks.parseCustomEngineManifest.mockResolvedValue(custom);
        store.list.mockResolvedValue([custom]);
        store.put.mockResolvedValue([custom]);
        const service = createService();

        await expect(
            service.registerCustomEditor('/editor/manifest.json'),
        ).resolves.toMatchObject({ success: false, duplicate: custom });
        expect(store.put).not.toHaveBeenCalled();

        await expect(
            service.registerCustomEditor('/editor/manifest.json', {
                replaceExisting: true,
            }),
        ).resolves.toMatchObject({ success: true, release: custom });
        expect(store.put).toHaveBeenCalledWith(custom);
        expect(projectRepair.revalidateProjects).toHaveBeenCalledOnce();
    });

    it('rejects custom registration during an official install and permits it after cleanup', async () => {
        const custom = createRelease('4.4-stable', { source: 'custom' });
        manifestMocks.parseCustomEngineManifest.mockResolvedValue(custom);
        const service = createService();
        const releaseReservation = service.reserveOfficialInstall(custom);

        await expect(
            service.registerCustomEditor('/editor/manifest.json', {
                replaceExisting: true,
            }),
        ).resolves.toMatchObject({
            success: false,
            error: 'installs:selection.errors.busy',
        });
        expect(store.put).not.toHaveBeenCalled();

        releaseReservation();
        await expect(
            service.registerCustomEditor('/editor/manifest.json'),
        ).resolves.toMatchObject({ success: true });
    });

    it('deletes only launcher-managed editor files during removal', async () => {
        const service = createService();
        const managed = createRelease('4.3-stable');
        const custom = createRelease('studio-build', { source: 'custom' });

        await service.removeEditor(managed);
        await service.removeEditor(custom);

        expect(fsMocks.promises.rm).toHaveBeenCalledOnce();
        expect(fsMocks.promises.rm).toHaveBeenCalledWith(managed.install_path, {
            recursive: true,
            force: true,
        });
        expect(projectRepair.removeEditorFromProjects).toHaveBeenCalledTimes(2);
    });

    it('opens the platform-specific project manager executable', () => {
        osMocks.platform.mockReturnValue('darwin');
        const editorPath = path.resolve('Applications', 'Godot.app');
        const release = createRelease('4.3-stable', {
            editor_path: editorPath,
        });

        createService().openProjectManager(release);

        expect(spawnMocks.spawn).toHaveBeenCalledWith(
            path.resolve(editorPath, 'Contents', 'MacOS', 'Godot'),
            ['-p'],
            { detached: true, stdio: 'ignore' },
        );
    });

    it('keeps a failed deletion registered and continues the rest of a batch', async () => {
        const failed = createRelease('4.3-stable');
        const removed = createRelease('4.4-stable');
        let registered = [failed, removed];
        store.list.mockImplementation(async () => registered);
        store.remove.mockImplementation(async (release: InstalledRelease) => {
            registered = registered.filter(
                (candidate) => candidate !== release,
            );
            return registered;
        });
        fsMocks.promises.rm.mockRejectedValueOnce(new Error('Access denied'));

        const result = await createService().removeEditors([
            { release: failed, onlyUnused: false },
            { release: removed, onlyUnused: false },
        ]);

        expect(result.outcomes).toEqual([
            { release: failed, status: 'failed', error: 'Access denied' },
            { release: removed, status: 'removed' },
        ]);
        expect(result.releases).toEqual([failed]);
        expect(store.remove).toHaveBeenCalledExactlyOnceWith(removed);
        expect(
            projectRepair.removeEditorFromProjects,
        ).toHaveBeenCalledExactlyOnceWith(removed);
    });

    it('keeps a used project editor copy when installation deletion fails', async () => {
        const release = createRelease('4.3-stable');
        store.list.mockResolvedValue([release]);
        let projectEditorExists = true;
        projectRepair.removeEditorFromProjects.mockImplementation(async () => {
            projectEditorExists = false;
        });
        fsMocks.promises.rm.mockRejectedValueOnce(new Error('Access denied'));

        const result = await createService().removeEditors([
            { release, onlyUnused: false },
        ]);

        expect(result.outcomes[0]).toMatchObject({ status: 'failed' });
        expect(projectEditorExists).toBe(true);
        expect(projectRepair.removeEditorFromProjects).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
    });

    it('reserves removal before querying project usage so custom replacement cannot race it', async () => {
        const release = createRelease('4.3-stable');
        const custom = {
            ...release,
            source: 'custom' as const,
            managed_by_launcher: false,
        };
        store.list.mockResolvedValue([release]);
        manifestMocks.parseCustomEngineManifest.mockResolvedValue(custom);
        let finishUsageQuery: (projects: []) => void = () => undefined;
        projectRepair.getProjectsUsingEditor.mockImplementationOnce(
            () =>
                new Promise<[]>((resolve) => {
                    finishUsageQuery = resolve;
                }),
        );
        const service = createService();

        const removal = service.removeEditors([{ release, onlyUnused: true }]);
        await vi.waitFor(() =>
            expect(projectRepair.getProjectsUsingEditor).toHaveBeenCalledOnce(),
        );
        expect(
            (
                await service.registerCustomEditor('/editor/manifest.json', {
                    replaceExisting: true,
                })
            ).success,
        ).toBe(false);
        expect(store.put).not.toHaveBeenCalled();
        expect(() => service.reserveOfficialInstall(release)).toThrow(
            'installs:selection.errors.busy',
        );
        finishUsageQuery([]);
        expect((await removal).outcomes[0].status).toBe('removed');
        expect(
            (
                await service.registerCustomEditor('/editor/manifest.json', {
                    replaceExisting: true,
                })
            ).success,
        ).toBe(true);
    });

    it('keeps a registration mutation reserved until persistence finishes', async () => {
        const release = createRelease('4.3-stable');
        const custom = {
            ...release,
            source: 'custom' as const,
            managed_by_launcher: false,
        };
        store.list.mockResolvedValue([release]);
        manifestMocks.parseCustomEngineManifest.mockResolvedValue(custom);
        let finishRegistration: (releases: InstalledRelease[]) => void = () =>
            undefined;
        store.put.mockImplementationOnce(
            () =>
                new Promise<InstalledRelease[]>((resolve) => {
                    finishRegistration = resolve;
                }),
        );
        const service = createService();

        const registering = service.registerCustomEditor(
            '/editor/manifest.json',
            { replaceExisting: true },
        );
        await vi.waitFor(() => expect(store.put).toHaveBeenCalledOnce());
        expect(
            (await service.removeEditors([{ release, onlyUnused: false }]))
                .outcomes[0].status,
        ).toBe('skipped');
        expect((await service.removeEditor(release)).success).toBe(false);
        expect(() => service.reserveOfficialInstall(release)).toThrow(
            'installs:selection.errors.busy',
        );
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        finishRegistration([custom]);
        expect((await registering).success).toBe(true);
        expect(() => service.reserveOfficialInstall(release)).not.toThrow();
    });

    it('checks project assignments again for unused selections', async () => {
        const release = createRelease('4.3-stable');
        store.list.mockResolvedValue([release]);
        projectRepair.getProjectsUsingEditor.mockResolvedValue([
            { name: 'Missing project', valid: false },
        ]);

        const result = await createService().removeEditors([
            { release, onlyUnused: true },
        ]);

        expect(result.outcomes[0]).toMatchObject({ status: 'skipped' });
        expect(result.releases).toEqual([release]);
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
    });

    it('does not remove a changed installation or use paths supplied by a stale selection', async () => {
        const previous = createRelease('4.3-stable');
        const replacement = {
            ...previous,
            install_path: '/editors/new',
            editor_path: '/editors/new/Godot',
        };
        store.list.mockResolvedValue([replacement]);

        const result = await createService().removeEditors([
            { release: previous, onlyUnused: false },
        ]);

        expect(result.outcomes[0]).toMatchObject({ status: 'skipped' });
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
    });

    it('skips an editor whose installation was queued after selection', async () => {
        const release = createRelease('4.3-stable');
        store.list.mockResolvedValue([release]);
        const result = await createService().removeEditors(
            [{ release, onlyUnused: false }],
            () => true,
        );

        expect(result.outcomes[0]).toMatchObject({
            status: 'skipped',
            error: 'installs:selection.errors.busy',
        });
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(store.remove).not.toHaveBeenCalled();
    });

    it('keeps custom files and rejects custom editors in unused-only selections', async () => {
        const custom = createRelease('studio-build', { source: 'custom' });
        store.list.mockResolvedValue([custom]);
        const service = createService();

        expect(
            (
                await service.removeEditors([
                    { release: custom, onlyUnused: true },
                ])
            ).outcomes[0].status,
        ).toBe('skipped');
        expect(
            (
                await service.removeEditors([
                    { release: custom, onlyUnused: false },
                ])
            ).outcomes[0].status,
        ).toBe('removed');
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(store.remove).toHaveBeenCalledExactlyOnceWith(custom);
    });

    it('rejects removal during an install and prevents installs during removal', async () => {
        const release = createRelease('4.3-stable');
        store.list.mockResolvedValue([release]);
        const service = createService();
        const finishInstall = service.reserveOfficialInstall(release);

        expect(
            (await service.removeEditors([{ release, onlyUnused: false }]))
                .outcomes[0],
        ).toMatchObject({
            status: 'skipped',
            error: 'installs:selection.errors.busy',
        });
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        finishInstall();

        let finishRemoval: () => void = () => undefined;
        fsMocks.promises.rm.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishRemoval = resolve;
                }),
        );
        const removing = service.removeEditor(release);
        await vi.waitFor(() =>
            expect(fsMocks.promises.rm).toHaveBeenCalledOnce(),
        );
        expect(() => service.reserveOfficialInstall(release)).toThrow(
            'installs:selection.errors.busy',
        );
        expect((await service.removeEditor(release)).success).toBe(false);
        finishRemoval();
        expect((await removing).success).toBe(true);
        expect(() => service.reserveOfficialInstall(release)).not.toThrow();
    });

    it('reports successful deletion even when project revalidation fails afterwards', async () => {
        const release = createRelease('4.3-stable');
        projectRepair.revalidateProjects.mockRejectedValueOnce(
            new Error('Project unavailable'),
        );

        expect((await createService().removeEditor(release)).success).toBe(
            true,
        );
        expect(store.remove).toHaveBeenCalledWith(release);
    });

    it('keeps a completed removal successful when project editor cleanup fails', async () => {
        const release = createRelease('4.3-stable');
        projectRepair.removeEditorFromProjects.mockRejectedValueOnce(
            new Error('Project unavailable'),
        );

        expect((await createService().removeEditor(release)).success).toBe(
            true,
        );
        expect(store.remove).toHaveBeenCalledWith(release);
        expect(projectRepair.revalidateProjects).toHaveBeenCalledOnce();
    });

    /** Creates a service with isolated dependency mocks. */
    function createService(): InstalledEditorService {
        return new InstalledEditorService(
            store as never,
            configService as never,
            projectRepair as never,
        );
    }
});

/**
 * Creates one installed editor record.
 *
 * @param version - Editor version.
 * @param overrides - Values that replace defaults.
 * @returns One installed editor.
 */
function createRelease(
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease {
    return {
        version,
        version_number: Number.parseFloat(version),
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
