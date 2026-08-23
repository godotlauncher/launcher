import * as path from 'node:path';
import type { AddProjectOptions } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import type { InstalledEditorService } from '../editor-installs/installed-editor.service.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import { ProjectImportService } from './project-import.service.js';
import type { ProjectsStore } from './projects.store.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    readdirSync: fsMocks.readdirSync,
    promises: { readFile: fsMocks.readFile },
    default: {
        existsSync: fsMocks.existsSync,
        readdirSync: fsMocks.readdirSync,
        promises: { readFile: fsMocks.readFile },
    },
}));

const godotProjectMocks = vi.hoisted(() => ({
    parseGodotProjectFile: vi.fn(),
    getProjectNameFromParsed: vi.fn(),
    getProjectRendererFromParsed: vi.fn(),
    getProjectConfigVersionFromParsed: vi.fn(),
    getProjectGodotVersionFromParsed: vi.fn(),
    getProjectIconUrlFromParsed: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    addProjectToList: vi.fn(),
}));

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('../commands/userPreferences.js', () => userPreferencesMocks);

const projectsMocks = vi.hoisted(() => ({
    getProjectsDetails: vi.fn(),
}));

const godotUtilsMocks = vi.hoisted(() => ({
    DEFAULT_PROJECT_DEFINITION: new Map(),
    getProjectDefinition: vi.fn(),
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

const projectLauncherConfigMocks = vi.hoisted(() => ({
    readProjectLauncherConfig: vi.fn(),
    writeProjectLauncherConfig: vi.fn(),
    getReleaseBaseVersion: vi.fn((release) => {
        if (release.base_version) return release.base_version;
        return release.version.match(/(\d+\.\d+)/)?.[1] ?? '0.0';
    }),
    getReleaseChannel: vi.fn((release) =>
        release.source === 'custom' ? 'custom' : 'official',
    ),
    getReleaseFlavor: vi.fn((release) =>
        release.mono ? 'dotnet' : 'gdscript',
    ),
}));

vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    ...projectLauncherConfigMocks,
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

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
    },
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        dock: {
            show: vi.fn(),
            hide: vi.fn(),
        },
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn(),
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
    },
}));

vi.mock('electron-log', () => ({
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { existsSync, readdirSync, readFile } = fsMocks;
const {
    parseGodotProjectFile,
    getProjectNameFromParsed,
    getProjectRendererFromParsed,
    getProjectConfigVersionFromParsed,
    getProjectGodotVersionFromParsed,
    getProjectIconUrlFromParsed,
} = godotProjectMocks;
const { getDefaultDirs } = platformMocks;
const { addProjectToList } = projectUtilsMocks;
const getInstalledReleases = vi.fn();
const installedEditorService = {
    getInstalledEditors: getInstalledReleases,
} as unknown as InstalledEditorService;
const { getUserPreferences } = userPreferencesMocks;
const { getProjectsDetails } = projectsMocks;
const defaultGitService = {
    inspectRepository: vi.fn().mockResolvedValue({
        status: 'not-a-repository',
    }),
} as unknown as GitService;
const projectsStore = {
    list: getProjectsDetails,
    put: addProjectToList,
} as unknown as ProjectsStore;
const codeEditorIntegrationService = {
    findConfiguredIntegrations: vi.fn(),
    getSelectionEligibility: vi.fn(),
    applyToProject: vi.fn(),
    disableForProject: vi.fn(),
} as unknown as CodeEditorIntegrationService;

const integrationMocks = codeEditorIntegrationService as unknown as {
    findConfiguredIntegrations: ReturnType<typeof vi.fn>;
    getSelectionEligibility: ReturnType<typeof vi.fn>;
    applyToProject: ReturnType<typeof vi.fn>;
};
const {
    getProjectDefinition,
    SetProjectEditorRelease: setProjectEditorRelease,
} = godotUtilsMocks;
const { readProjectLauncherConfig, writeProjectLauncherConfig } =
    projectLauncherConfigMocks;

/**
 * Calls the project command with its installed editor dependency.
 *
 * @param projectPath - Path to the project file.
 * @param integrationService - Code editor integration service.
 * @param options - Optional missing-editor resolution.
 * @param gitService - Optional Git inspection service.
 * @returns The project import result.
 */
function addProject(
    projectPath: string,
    integrationService: CodeEditorIntegrationService,
    options: AddProjectOptions = {},
    gitService: GitService = defaultGitService,
) {
    return new ProjectImportService(
        integrationService,
        installedEditorService,
        gitService,
        projectsStore,
    ).addProject(projectPath, options);
}

describe('addProject', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        existsSync.mockImplementation(
            (target) =>
                typeof target === 'string' && target.endsWith('project.godot'),
        );
        readdirSync.mockReturnValue(['project.godot']);
        readFile.mockResolvedValue('dummy');
        parseGodotProjectFile.mockReturnValue(new Map());
        getProjectNameFromParsed.mockResolvedValue('Sample Project');
        getProjectRendererFromParsed.mockResolvedValue('FORWARD_PLUS');
        getProjectConfigVersionFromParsed.mockResolvedValue(5);
        getProjectGodotVersionFromParsed.mockReturnValue(null);
        getProjectIconUrlFromParsed.mockReturnValue(undefined);

        getDefaultDirs.mockReturnValue({
            configDir: '/config',
            dataDir: '',
            projectDir: '',
            prefsPath: '',
            releaseCachePath: '',
            installedReleasesCachePath: '',
            prereleaseCachePath: '',
        });

        getProjectsDetails.mockResolvedValue([]);
        getUserPreferences.mockResolvedValue({
            prefs_version: 1,
            install_location: '/install',
            config_location: '',
            projects_location: '',
            post_launch_action: 'none',
            auto_check_updates: false,
            auto_start: false,
            start_in_tray: false,
            confirm_project_remove: false,
            first_run: false,
        });

        getInstalledReleases.mockResolvedValue([
            {
                version: '4.3-stable',
                version_number: 4.3,
                install_path: '/install/4.3',
                editor_path: '/install/4.3/Godot',
                platform: process.platform,
                arch: 'x86_64',
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        addProjectToList.mockImplementation(async (project) => [project]);
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.tres',
            editorConfigFormat: 3,
        });
        setProjectEditorRelease.mockResolvedValue('/fake/launch');

        integrationMocks.findConfiguredIntegrations.mockImplementation(
            async (projectDir: string) =>
                existsSync(path.resolve(projectDir, '.vscode'))
                    ? ['vscode']
                    : [],
        );
        integrationMocks.getSelectionEligibility.mockResolvedValue('eligible');
        integrationMocks.applyToProject.mockImplementation(
            async (_id, context) => ({
                editorSettingsFile: context.editorSettingsFile,
                recoveredConfigFiles: [],
            }),
        );
        readProjectLauncherConfig.mockResolvedValue(null);
        writeProjectLauncherConfig.mockResolvedValue(undefined);
    });

    it('falls back to an installed mono editor when no flavor-specific match is found', async () => {
        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.added_at).toBeInstanceOf(Date);
        expect(result.newProject?.release.mono).toBe(true);
        expect(result.newProject?.release.version).toBe('4.3-stable');
        expect(setProjectEditorRelease).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ mono: true, version: '4.3-stable' }),
        );
        expect(writeProjectLauncherConfig).toHaveBeenCalledWith(
            '/fake/project',
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
            }),
        );
    });

    it('selects the newest installed stable editor for the project Godot branch', async () => {
        getProjectGodotVersionFromParsed.mockReturnValue('4.4');
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.5-stable',
                version_number: 4.5,
                install_path: '/install/4.5',
                editor_path: '/install/4.5/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            {
                version: '4.4.1-stable',
                version_number: 4.4,
                install_path: '/install/4.4.1',
                editor_path: '/install/4.4.1/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            {
                version: '4.4.3-stable',
                version_number: 4.4,
                install_path: '/install/4.4.3',
                editor_path: '/install/4.4.3/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.release.version).toBe('4.4.3-stable');
    });

    it('requests the inferred stable branch instead of using a newer minor', async () => {
        getProjectGodotVersionFromParsed.mockReturnValue('4.4');
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.5-stable',
                version_number: 4.5,
                install_path: '/install/4.5',
                editor_path: '/install/4.5/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result).toMatchObject({
            success: false,
            editorResolution: {
                requested: {
                    kind: 'stable-base',
                    channel: 'official',
                    flavor: 'gdscript',
                    base_version: '4.4',
                },
                downloadable: {
                    match: 'stable-base',
                    base_version: '4.4',
                    flavor: 'gdscript',
                },
            },
        });
        expect(addProjectToList).not.toHaveBeenCalled();
    });

    it('infers the .NET flavour for a project that has a solution file', async () => {
        getProjectGodotVersionFromParsed.mockReturnValue('4.4');
        readdirSync.mockReturnValue(['project.godot', 'sample.sln']);
        getInstalledReleases.mockResolvedValue([]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.editorResolution?.requested).toMatchObject({
            kind: 'stable-base',
            flavor: 'dotnet',
            base_version: '4.4',
        });
    });

    it('adds an inferred project with a missing editor when requested', async () => {
        getProjectGodotVersionFromParsed.mockReturnValue('4.4');
        getInstalledReleases.mockResolvedValue([]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
            { resolution: 'add_missing' },
        );

        expect(result.success).toBe(true);
        expect(result.newProject).toMatchObject({
            valid: false,
            invalid_reason: 'missing_editor',
            release: {
                version: '4.4-stable',
                base_version: '4.4',
                source: 'official',
                valid: false,
            },
        });
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
    });

    it('marks an imported project as covered by an enclosing repository', async () => {
        const gitService = {
            inspectRepository: vi.fn().mockResolvedValue({
                status: 'inside-work-tree',
                root: '/fake',
                isProjectRoot: false,
                kind: 'standard',
            }),
        };

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
            {},
            gitService as never,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.withGit).toBe(true);
        expect(gitService.inspectRepository).toHaveBeenCalledWith(
            '/fake/project',
        );
    });

    it('sanitises only the imported editor directory name', async () => {
        getProjectNameFromParsed.mockResolvedValue('Example: Project');

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.name).toBe('Example: Project');
        expect(setProjectEditorRelease).toHaveBeenCalledWith(
            path.resolve('/install/.editor_config/Example- Project'),
            expect.any(Object),
        );
    });

    it('uses the locally configured code editor when importing', async () => {
        integrationMocks.findConfiguredIntegrations.mockResolvedValue([
            'vscode',
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(
            integrationMocks.findConfiguredIntegrations,
        ).toHaveBeenCalledWith('/fake/project');
        expect(result.newProject?.codeEditorId).toBe('vscode');
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ projectPath: '/fake/project' }),
        );
        const [, input] = writeProjectLauncherConfig.mock.calls[0];
        expect(input).not.toHaveProperty('codeEditorId');
    });

    it('imports ambiguous project-file matches as explicit None', async () => {
        integrationMocks.findConfiguredIntegrations.mockResolvedValue([
            'vscode',
            'future-editor',
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.codeEditorId).toBeNull();
        expect(integrationMocks.getSelectionEligibility).not.toHaveBeenCalled();
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
    });

    it('does not infer a disabled integration from project files', async () => {
        integrationMocks.findConfiguredIntegrations.mockResolvedValue([]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.codeEditorId).toBeNull();
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
    });

    it('prefers an exact .godotlauncher editor match when importing', async () => {
        getProjectGodotVersionFromParsed.mockReturnValue('4.6');
        readProjectLauncherConfig.mockResolvedValue({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.3',
                version: '4.3-beta1',
            },
        });
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.3-stable',
                version_number: 4.3,
                install_path: '/install/4.3',
                editor_path: '/install/4.3/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            {
                version: '4.3-beta1',
                version_number: 4.3,
                install_path: '/install/4.3-beta1',
                editor_path: '/install/4.3-beta1/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: true,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.release.version).toBe('4.3-beta1');
        expect(result.newProject?.release.mono).toBe(false);
    });

    it('returns a resolution for an official .godotlauncher version with an installed fallback', async () => {
        readProjectLauncherConfig.mockResolvedValue({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.3',
                version: '4.3-beta1',
            },
        });
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.3-stable',
                base_version: '4.3',
                version_number: 4.3,
                install_path: '/install/4.3',
                editor_path: '/install/4.3/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(false);
        expect(result.editorResolution).toMatchObject({
            requested: {
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.3',
                version: '4.3-beta1',
            },
            fallback: expect.objectContaining({ version: '4.3-stable' }),
            downloadable: {
                version: '4.3-beta1',
                flavor: 'gdscript',
                prerelease: true,
            },
        });
        expect(addProjectToList).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
    });

    it('returns a resolution for a missing custom .godotlauncher version without fallback', async () => {
        readProjectLauncherConfig.mockResolvedValue({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'custom',
                flavor: 'gdscript',
                base_version: '4.6',
                version: '4.6-missing',
            },
        });
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.3-stable',
                base_version: '4.3',
                version_number: 4.3,
                install_path: '/install/4.3',
                editor_path: '/install/4.3/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            {
                version: '4.6-custom.1',
                base_version: '4.6',
                name: 'Acme Godot',
                version_number: 4.6,
                install_path: '/engines/acme',
                editor_path: '/engines/acme/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: true,
                config_version: 5,
                published_at: null,
                valid: true,
                source: 'custom',
                manifest_path:
                    '/engines/acme/godotlauncher-editor-manifest.json',
                managed_by_launcher: false,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(false);
        expect(result.editorResolution).toMatchObject({
            requested: {
                channel: 'custom',
                flavor: 'gdscript',
                base_version: '4.6',
                version: '4.6-missing',
            },
        });
        expect(result.editorResolution?.fallback).toBeUndefined();
        expect(result.editorResolution?.downloadable).toBeUndefined();
        expect(addProjectToList).not.toHaveBeenCalled();
    });

    it('adds an invalid project when requested .godotlauncher editor should be kept missing', async () => {
        readProjectLauncherConfig.mockResolvedValue({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'custom',
                flavor: 'gdscript',
                base_version: '4.6',
                version: '4.6-missing',
            },
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
            {
                resolution: 'add_missing',
            },
        );

        expect(result.success).toBe(true);
        expect(result.newProject).toMatchObject({
            codeEditorId: null,
            valid: false,
            invalid_reason: 'missing_editor',
            launch_path: '',
            release: {
                version: '4.6-missing',
                source: 'custom',
                valid: false,
                editor_path: '',
                install_path: '',
            },
        });
        expect(setProjectEditorRelease).not.toHaveBeenCalled();
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
    });

    it('uses an explicit fallback and writes .godotlauncher with the selected editor', async () => {
        const fallbackRelease = {
            version: '4.3-stable',
            base_version: '4.3',
            version_number: 4.3,
            install_path: '/install/4.3',
            editor_path: '/install/4.3/Godot',
            platform: process.platform,
            arch: process.arch,
            mono: false,
            prerelease: false,
            config_version: 5 as const,
            published_at: null,
            valid: true,
        };
        readProjectLauncherConfig.mockResolvedValue({
            config: { version: 1 },
            launcher: { version: '1.9.0' },
            editor: {
                channel: 'official',
                flavor: 'gdscript',
                base_version: '4.3',
                version: '4.3-beta1',
            },
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
            {
                resolution: 'use_fallback',
                release: fallbackRelease,
            },
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.release.version).toBe('4.3-stable');
        expect(writeProjectLauncherConfig).toHaveBeenCalledWith(
            '/fake/project',
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
            }),
        );
    });

    it('considers compatible custom engines when importing a project', async () => {
        getInstalledReleases.mockResolvedValue([
            {
                version: '4.6-custom.1',
                name: 'Acme Godot 4.6 Custom Engine',
                version_number: 4.6,
                install_path: '/engines/acme',
                editor_path: '/engines/acme/Godot',
                platform: process.platform,
                arch: process.arch,
                mono: false,
                prerelease: true,
                config_version: 5,
                published_at: null,
                valid: true,
                source: 'custom',
                manifest_path:
                    '/engines/acme/godotlauncher-editor-manifest.json',
                managed_by_launcher: false,
            },
        ]);

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.release.version).toBe('4.6-custom.1');
        expect(result.newProject?.release.source).toBe('custom');
    });

    it('should not return additionalInfo in the result', async () => {
        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('additionalInfo');
    });

    it('stores the resolved project icon url when importing', async () => {
        getProjectIconUrlFromParsed.mockReturnValue(
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        );

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.icon_path).toBe(
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        );
        expect(getProjectIconUrlFromParsed).toHaveBeenCalledWith(
            '/fake/project',
            expect.any(Map),
        );
    });

    it('returns recovered VS Code config files as project-relative paths', async () => {
        const projectPath = path.resolve('/fake/project/project.godot');
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                return false;
            }
            return false;
        });
        integrationMocks.applyToProject.mockResolvedValue({
            editorSettingsFile: '/fake/editor/settings',
            recoveredConfigFiles: [
                '.vscode/settings.json.1712345678901.bad',
                '.vscode/launch.json.1712345678902.bad',
                '.vscode/extensions.json.1712345678903.bad',
            ],
        });

        const result = await addProject(
            projectPath,
            codeEditorIntegrationService,
        );
        expect(result.recoveredCodeEditorConfigFiles).toEqual([
            '.vscode/settings.json.1712345678901.bad',
            '.vscode/launch.json.1712345678902.bad',
            '.vscode/extensions.json.1712345678903.bad',
        ]);

        expect(result.success).toBe(true);
    });

    it('applies an inferred integration when Godot settings do not exist', async () => {
        // Mock .vscode folder exists but no editor settings
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                if (target.includes('editor_settings')) return false;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.newProject?.codeEditorId).toBe('vscode');
        expect(integrationMocks.applyToProject).toHaveBeenCalledOnce();
    });

    it('applies an inferred integration when Godot settings exist', async () => {
        // Mock .vscode folder and editor settings exist
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                if (target.includes('editor_settings')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ projectPath: '/fake/project' }),
        );
    });

    it('delegates inferred project configuration to the integration', async () => {
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({
                projectPath: expect.stringContaining('/fake/project'),
            }),
        );
    });

    it('passes the .NET Godot flavor to an inferred integration', async () => {
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ mono: true }),
        );
    });

    it('does not configure a code editor when none is inferred', async () => {
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
    });

    it('does not configure a code editor when no project files match', async () => {
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return false;
                return false;
            }
            return false;
        });

        const result = await addProject(
            '/fake/project/project.godot',
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
    });
});
