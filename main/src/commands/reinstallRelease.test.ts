import type {
    EditorCatalogRelease,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import type { EditorCatalogService } from '../editor-catalog/editor-catalog.service.js';

const checksMocks = vi.hoisted(() => ({
    checkAndUpdateProjects: vi.fn(),
    checkAndUpdateReleases: vi.fn(),
}));

vi.mock('../checks.js', () => checksMocks);

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
    tag: invalidRelease.version,
    version: invalidRelease.version,
    version_number: invalidRelease.version_number,
    name: 'Godot 4.2.0-stable',
    published_at: invalidRelease.published_at,
    draft: false,
    prerelease: false,
    assets: [
        {
            name: 'Godot_v4.2.0-stable_macos.universal.zip',
            download_url:
                'https://github.com/godotengine/godot/releases/download/4.2.0-stable/Godot_v4.2.0-stable_macos.universal.zip',
            digest: `sha256:${'a'.repeat(64)}`,
            checksum_manifest_url:
                'https://github.com/godotengine/godot/releases/download/4.2.0-stable/SHA512-SUMS.txt',
            platform_tags: ['darwin', 'arm64'],
            mono: false,
        },
    ],
};

const catalogRelease: EditorCatalogRelease = {
    id: `official-stable:${invalidRelease.version}`,
    sourceReleaseId: '42',
    providerId: 'official-stable',
    tag: invalidRelease.version,
    version: invalidRelease.version,
    baseVersion: '4.2',
    name: releaseSummary.name,
    publishedAt: invalidRelease.published_at,
    prerelease: false,
    versionParts: {
        major: 4,
        minor: 2,
        patch: 0,
        channel: 'stable',
        iteration: 0,
    },
    variants: [
        {
            id: `official-stable:${invalidRelease.version}:gdscript`,
            flavor: 'gdscript',
            assets: [
                {
                    id: `official-stable:${invalidRelease.version}:gdscript:asset:darwin:arm64`,
                    name: releaseSummary.assets[0].name,
                    downloadUrl: releaseSummary.assets[0].download_url,
                    digest: releaseSummary.assets[0].digest,
                    checksumManifestUrl:
                        releaseSummary.assets[0].checksum_manifest_url,
                    platform: 'darwin',
                    architecture: 'arm64',
                },
            ],
        },
    ],
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
    codeEditorId: null,
    withGit: false,
    valid: false,
};

const codeEditorIntegrationService = {} as CodeEditorIntegrationService;
const editorCatalogService = {
    getCatalog: vi.fn(),
} as unknown as EditorCatalogService;

describe('reinstallRelease', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checksMocks.checkAndUpdateProjects.mockResolvedValue([]);
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([]);
        setProjectEditorMocks.setProjectEditor.mockResolvedValue({
            success: true,
            projects: [],
        });
        vi.mocked(editorCatalogService.getCatalog).mockResolvedValue({
            releases: [],
            providers: [],
        });
    });

    it('skips download when validation finds a valid replacement', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([validRelease]);
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([project]);

        const result = await reinstallRelease(
            invalidRelease,
            codeEditorIntegrationService,
            editorCatalogService,
        );

        expect(result.success).toBe(true);
        expect(result.release).toBe(validRelease);
        expect(installReleaseMocks.installRelease).not.toHaveBeenCalled();
        expect(editorCatalogService.getCatalog).not.toHaveBeenCalled();
        expect(setProjectEditorMocks.setProjectEditor).toHaveBeenCalledWith(
            project,
            validRelease,
            codeEditorIntegrationService,
        );
    });

    it('installs matching release metadata and repairs projects', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([invalidRelease]);
        vi.mocked(editorCatalogService.getCatalog).mockResolvedValue({
            releases: [catalogRelease],
            providers: [],
        });
        installReleaseMocks.installRelease.mockResolvedValue({
            success: true,
            version: validRelease.version,
            release: validRelease,
        });
        projectUtilsMocks.getStoredProjectsList.mockResolvedValue([project]);

        const result = await reinstallRelease(
            invalidRelease,
            codeEditorIntegrationService,
            editorCatalogService,
        );

        expect(installReleaseMocks.installRelease).toHaveBeenCalledWith(
            releaseSummary,
            false,
        );
        expect(setProjectEditorMocks.setProjectEditor).toHaveBeenCalledWith(
            project,
            validRelease,
            codeEditorIntegrationService,
        );
        expect(result.success).toBe(true);
        expect(result.release).toBe(validRelease);
    });

    it('reinstalls a prerelease from matching catalogue metadata', async () => {
        const invalidPrerelease: InstalledRelease = {
            ...invalidRelease,
            version: '4.8-dev3',
            version_number: 4.8,
            prerelease: true,
        };
        const prereleaseCatalog: EditorCatalogRelease = {
            ...catalogRelease,
            id: 'official-prerelease:4.8-dev3',
            providerId: 'official-prerelease',
            tag: '4.8-dev3',
            version: '4.8-dev3',
            baseVersion: '4.8',
            name: '4.8-dev3',
            prerelease: true,
            versionParts: {
                major: 4,
                minor: 8,
                patch: 0,
                channel: 'dev',
                iteration: 3,
            },
        };
        const installedPrerelease: InstalledRelease = {
            ...invalidPrerelease,
            install_path: '/valid/prerelease',
            editor_path: '/valid/prerelease/Godot.app',
            valid: true,
        };
        checksMocks.checkAndUpdateReleases.mockResolvedValue([
            invalidPrerelease,
        ]);
        vi.mocked(editorCatalogService.getCatalog).mockResolvedValue({
            releases: [catalogRelease, prereleaseCatalog],
            providers: [],
        });
        installReleaseMocks.installRelease.mockResolvedValue({
            success: true,
            version: installedPrerelease.version,
            release: installedPrerelease,
        });

        const result = await reinstallRelease(
            invalidPrerelease,
            codeEditorIntegrationService,
            editorCatalogService,
        );

        expect(installReleaseMocks.installRelease).toHaveBeenCalledWith(
            expect.objectContaining({
                version: '4.8-dev3',
                prerelease: true,
            }),
            false,
        );
        expect(result).toEqual({
            success: true,
            version: installedPrerelease.version,
            release: installedPrerelease,
        });
    });

    it('returns a clear failure when release metadata is unavailable', async () => {
        checksMocks.checkAndUpdateReleases.mockResolvedValue([invalidRelease]);

        const result = await reinstallRelease(
            invalidRelease,
            codeEditorIntegrationService,
            editorCatalogService,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Release metadata not found');
        expect(installReleaseMocks.installRelease).not.toHaveBeenCalled();
        expect(setProjectEditorMocks.setProjectEditor).not.toHaveBeenCalled();
    });
});
