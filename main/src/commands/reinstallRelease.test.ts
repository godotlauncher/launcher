import type {
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checksMocks = vi.hoisted(() => ({
    checkAndUpdateProjects: vi.fn(),
    checkAndUpdateReleases: vi.fn(),
}));

vi.mock('../checks.js', () => checksMocks);

const releasesCommandMocks = vi.hoisted(() => ({
    getAvailableReleases: vi.fn(),
    getAvailablePrereleases: vi.fn(),
}));

vi.mock('./releases.js', () => releasesCommandMocks);

const installReleaseMocks = vi.hoisted(() => ({
    installRelease: vi.fn(),
}));

vi.mock('./installRelease.js', () => installReleaseMocks);

const setProjectEditorMocks = vi.hoisted(() => ({
    setProjectEditor: vi.fn(),
}));

vi.mock('./setProjectEditor.js', () => setProjectEditorMocks);

const platformUtilsMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(() => ({
        configDir: '/config',
    })),
}));

vi.mock('../utils/platform.utils.js', () => platformUtilsMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    getStoredProjectsList: vi.fn(),
}));

vi.mock('../utils/projects.utils.js', () => projectUtilsMocks);

vi.mock('../utils/releases.utils.js', () => ({
    hasSameInstalledReleaseIdentity: (
        first: InstalledRelease,
        second: InstalledRelease,
    ) => first.version === second.version && first.mono === second.mono,
}));

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
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

import { reinstallRelease } from './reinstallRelease.js';

const invalidRelease: InstalledRelease = {
    version: '4.2.0-stable',
    version_number: 4.2,
    install_path: '/missing/install',
    editor_path: '/missing/install/Godot.app',
    platform: 'darwin',
    arch: 'arm64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2024-01-01T00:00:00Z',
    valid: false,
};

const validRelease: InstalledRelease = {
    ...invalidRelease,
    install_path: '/valid/install',
    editor_path: '/valid/install/Godot.app',
    valid: true,
};

const releaseSummary: ReleaseSummary = {
    version: invalidRelease.version,
    version_number: invalidRelease.version_number,
    name: 'Godot 4.2.0-stable',
    published_at: invalidRelease.published_at,
    draft: false,
    prerelease: false,
    assets: [],
};

const project: ProjectDetails = {
    name: 'Project',
    version: invalidRelease.version,
    version_number: invalidRelease.version_number,
    renderer: 'forward_plus',
    path: '/projects/project',
    editor_settings_path: '',
    editor_settings_file: '',
    last_opened: null,
    release: invalidRelease,
    launch_path: '/project/editor/Godot.app',
    config_version: 5,
    withVSCode: false,
    withGit: false,
    valid: false,
};

describe('reinstallRelease', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checksMocks.checkAndUpdateProjects.mockResolvedValue([]);
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([]);
        setProjectEditorMocks.setProjectEditor.mockResolvedValue({
            success: true,
            projects: [],
        });
        releasesCommandMocks.getAvailableReleases.mockResolvedValue({
            releases: [],
        });
        releasesCommandMocks.getAvailablePrereleases.mockResolvedValue({
            releases: [],
        });
    });

    it('skips download when validation finds a valid replacement', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([validRelease]);
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([project]);

        const result = await reinstallRelease(invalidRelease);

        expect(result.success).toBe(true);
        expect(result.release).toBe(validRelease);
        expect(installReleaseMocks.installRelease).not.toHaveBeenCalled();
        expect(setProjectEditorMocks.setProjectEditor).toHaveBeenCalledWith(
            project,
            validRelease,
        );
    });

    it('installs matching release metadata and repairs projects', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([invalidRelease]);
        releasesCommandMocks.getAvailableReleases.mockResolvedValue({
            releases: [releaseSummary],
        });
        installReleaseMocks.installRelease.mockResolvedValue({
            success: true,
            version: validRelease.version,
            release: validRelease,
        });
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([project]);

        const result = await reinstallRelease(invalidRelease);

        expect(installReleaseMocks.installRelease).toHaveBeenCalledWith(
            releaseSummary,
            false,
        );
        expect(setProjectEditorMocks.setProjectEditor).toHaveBeenCalledWith(
            project,
            validRelease,
        );
        expect(result.success).toBe(true);
        expect(result.release).toBe(validRelease);
    });

    it('returns a clear failure when release metadata is unavailable', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([invalidRelease]);

        const result = await reinstallRelease(invalidRelease);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Release metadata not found');
        expect(installReleaseMocks.installRelease).not.toHaveBeenCalled();
        expect(setProjectEditorMocks.setProjectEditor).not.toHaveBeenCalled();
    });
});
