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
        const release = createRelease('4.3-stable', {
            editor_path: '/Applications/Godot.app',
        });

        createService().openProjectManager(release);

        expect(spawnMocks.spawn).toHaveBeenCalledWith(
            '/Applications/Godot.app/Contents/MacOS/Godot',
            ['-p'],
            { detached: true, stdio: 'ignore' },
        );
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
