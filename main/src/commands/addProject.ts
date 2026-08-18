import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    AddProjectEditorResolution,
    AddProjectOptions,
    AddProjectToListResult,
    InstalledRelease,
    ProjectConfig,
    ProjectDetails,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import {
    EDITOR_CONFIG_DIRNAME,
    PROJECT_LAUNCHER_CONFIG_FILENAME,
    PROJECTS_FILENAME,
} from '../constants.js';
import type { InstalledEditorService } from '../editor-installs/installed-editor.service.js';
import { t } from '../i18n/index.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    type GodotProjectFile,
    getProjectConfigVersionFromParsed,
    getProjectIconUrlFromParsed,
    getProjectNameFromParsed,
    getProjectRendererFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import {
    getReleaseBaseVersion,
    getReleaseChannel,
    getReleaseFlavor,
    type ProjectLauncherConfig,
    readProjectLauncherConfig,
    writeProjectLauncherConfig,
} from '../utils/projectLauncherConfig.utils.js';
import { addProjectToList } from '../utils/projects.utils.js';
import { sortReleases } from '../utils/releaseSorting.utils.js';
import { getProjectsDetails } from './projects.js';
import { getUserPreferences } from './userPreferences.js';

function isCompatibleCustomPlatform(release: InstalledRelease): boolean {
    return (
        release.source !== 'custom' ||
        (release.platform === process.platform && release.arch === process.arch)
    );
}

function releaseMatchesProjectLauncherConfig(
    release: InstalledRelease,
    launcherConfig: ProjectLauncherConfig,
): boolean {
    return (
        getReleaseChannel(release) === launcherConfig.editor.channel &&
        getReleaseFlavor(release) === launcherConfig.editor.flavor
    );
}

function findReleaseFromProjectLauncherConfig(
    releases: InstalledRelease[],
    launcherConfig: ProjectLauncherConfig | null,
    configVersion: number,
): InstalledRelease | undefined {
    if (!launcherConfig) {
        return undefined;
    }

    const candidates = releases.filter(
        (release) =>
            release.valid &&
            release.config_version >= configVersion &&
            isCompatibleCustomPlatform(release) &&
            releaseMatchesProjectLauncherConfig(release, launcherConfig),
    );

    return (
        candidates.find(
            (release) => release.version === launcherConfig.editor.version,
        ) ??
        candidates
            .filter(
                (release) =>
                    getReleaseBaseVersion(release) ===
                    launcherConfig.editor.base_version,
            )
            .sort(sortReleases)[0]
    );
}

function findExactProjectLauncherRelease(
    releases: InstalledRelease[],
    launcherConfig: ProjectLauncherConfig,
    configVersion: number,
): InstalledRelease | undefined {
    return releases.find(
        (release) =>
            release.valid &&
            release.config_version >= configVersion &&
            release.version === launcherConfig.editor.version &&
            isCompatibleCustomPlatform(release) &&
            releaseMatchesProjectLauncherConfig(release, launcherConfig),
    );
}

function findProjectLauncherFallbackRelease(
    releases: InstalledRelease[],
    launcherConfig: ProjectLauncherConfig,
    configVersion: number,
): InstalledRelease | undefined {
    if (launcherConfig.editor.channel === 'custom') {
        return undefined;
    }

    return releases
        .filter(
            (release) =>
                release.valid &&
                release.config_version >= configVersion &&
                getReleaseBaseVersion(release) ===
                    launcherConfig.editor.base_version &&
                isCompatibleCustomPlatform(release) &&
                releaseMatchesProjectLauncherConfig(release, launcherConfig),
        )
        .sort(sortReleases)[0];
}

function createEditorResolution(
    launcherConfig: ProjectLauncherConfig,
    fallback: InstalledRelease | undefined,
): AddProjectEditorResolution {
    const requested = launcherConfig.editor;

    return {
        requested,
        fallback,
        downloadable:
            requested.channel === 'official'
                ? {
                      version: requested.version,
                      flavor: requested.flavor,
                      prerelease: !requested.version
                          .toLowerCase()
                          .includes('stable'),
                  }
                : undefined,
    };
}

function getRequestedVersionNumber(
    launcherConfig: ProjectLauncherConfig,
): number {
    const versionNumber = Number.parseFloat(launcherConfig.editor.base_version);
    return Number.isNaN(versionNumber) ? 0 : versionNumber;
}

function buildMissingRelease(
    launcherConfig: ProjectLauncherConfig,
    configVersion: number,
): InstalledRelease {
    return {
        version: launcherConfig.editor.version,
        base_version: launcherConfig.editor.base_version,
        flavor: launcherConfig.editor.flavor,
        version_number: getRequestedVersionNumber(launcherConfig),
        install_path: '',
        editor_path: '',
        platform: process.platform,
        arch: process.arch,
        mono: launcherConfig.editor.flavor === 'dotnet',
        prerelease: !launcherConfig.editor.version
            .toLowerCase()
            .includes('stable'),
        config_version: configVersion as 5,
        published_at: null,
        valid: false,
        source: launcherConfig.editor.channel,
    };
}

/**
 * Imports an existing Godot project into the Launcher project list.
 *
 * @param projectPath - Path to the project's project.godot file.
 * @param codeEditorIntegrationService - Code editor integration service.
 * @param installedEditorService - Installed editor query service.
 * @param options - Optional missing-editor resolution.
 * @param gitService - Git service used to inspect repository coverage.
 * @returns The project import result.
 */
export async function addProject(
    projectPath: string,
    codeEditorIntegrationService: CodeEditorIntegrationService,
    installedEditorService: InstalledEditorService,
    options: AddProjectOptions = {},
    gitService?: GitService,
): Promise<AddProjectToListResult> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const prefs = await getUserPreferences();

    // check if project already exist based on path
    const projects = await getProjectsDetails();

    const dirname = path.dirname(projectPath);

    if (projects.find((p) => p.path === dirname)) {
        return {
            success: false,
            error: t('projects:addProject.errors.projectExists', {
                path: dirname,
            }),
        };
    }

    // check if project.godot exist
    if (!fs.existsSync(projectPath)) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidPath'),
        };
    }
    let parsedConfig: GodotProjectFile | null = null;
    try {
        // read project file
        const projectFile = await fs.promises.readFile(projectPath, 'utf-8');
        parsedConfig = parseGodotProjectFile(projectFile);
        if (!parsedConfig) {
            throw new Error(t('projects:addProject.errors.invalidProjectFile'));
        }
    } catch (e) {
        if (e instanceof Error) {
            return {
                success: false,
                error: e.message,
            };
        }
        return {
            success: false,
            error: `${t('projects:addProject.errors.invalidProjectFile')} ${e}`,
        };
    }

    // get project name from path
    const projectName = await getProjectNameFromParsed(parsedConfig);

    // check if project with that name already exist
    if (projects.find((p) => p.name === projectName)) {
        return {
            success: false,
            error: t('projects:addProject.errors.nameExists', {
                name: projectName,
            }),
        };
    }

    // get renderer from project file
    const renderer = await getProjectRendererFromParsed(parsedConfig);

    if (renderer === 'Unknown') {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidRenderer'),
        };
    }

    const configVersion = await getProjectConfigVersionFromParsed(parsedConfig);

    // select the closest installed release
    const installedReleases =
        await installedEditorService.getInstalledEditors();
    const projectLauncherConfigPath = path.resolve(
        dirname,
        PROJECT_LAUNCHER_CONFIG_FILENAME,
    );
    let projectLauncherConfig: ProjectLauncherConfig | null = null;
    try {
        projectLauncherConfig = await readProjectLauncherConfig(dirname);
        if (
            !projectLauncherConfig &&
            fs.existsSync(projectLauncherConfigPath)
        ) {
            logger.warn(
                `Ignoring invalid project launcher config at ${projectLauncherConfigPath}`,
            );
        }
    } catch (error) {
        logger.warn(
            `Failed to read project launcher config at ${projectLauncherConfigPath}`,
            error,
        );
    }

    const releaseBaseVersion = configVersion === 5 ? 4.0 : 0;

    if (releaseBaseVersion === 0) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidConfigVersion'),
        };
    }

    // see if the project has a .csproj or a sln file
    const hasDotNET: boolean = fs
        .readdirSync(dirname)
        .some((f) => f.endsWith('.csproj') || f.endsWith('.sln'));

    let release: InstalledRelease | undefined;

    // find the closest stable release
    // get the highest version number for that major version

    const releases =
        installedReleases
            .filter((r) => {
                const matchingBaseVersion =
                    parseInt(r.version_number.toString(), 10) ===
                    parseInt(releaseBaseVersion.toString(), 10);
                const compatibleSource =
                    r.source === 'custom' ||
                    r.version.toLowerCase().includes('stable');
                return (
                    matchingBaseVersion &&
                    r.valid &&
                    compatibleSource &&
                    isCompatibleCustomPlatform(r)
                );
            })
            .sort(sortReleases) || [];

    let shouldWriteProjectLauncherConfig = true;
    let addAsMissingEditor = false;

    if (projectLauncherConfig) {
        if (options.resolution === 'use_fallback') {
            release = options.release;
        } else if (options.resolution === 'add_missing') {
            release = buildMissingRelease(projectLauncherConfig, configVersion);
            addAsMissingEditor = true;
            shouldWriteProjectLauncherConfig = false;
        } else {
            release = findExactProjectLauncherRelease(
                installedReleases,
                projectLauncherConfig,
                configVersion,
            );

            if (!release) {
                return {
                    success: false,
                    editorResolution: createEditorResolution(
                        projectLauncherConfig,
                        findProjectLauncherFallbackRelease(
                            installedReleases,
                            projectLauncherConfig,
                            configVersion,
                        ),
                    ),
                };
            }
        }
    } else {
        release = findReleaseFromProjectLauncherConfig(
            installedReleases,
            projectLauncherConfig,
            configVersion,
        );
    }

    if (!release) {
        if (releases.length === 0) {
            return {
                success: false,
                error: t('projects:addProject.errors.noStableReleases', {
                    version: releaseBaseVersion,
                }),
            };
        }

        if (hasDotNET && !releases.some((r) => r.mono)) {
            // no mono release available for this version
            return {
                success: false,
                error: t('projects:addProject.errors.noDotNetRelease'),
            };
        }

        const compatibleReleases = releases.filter(
            (r) => r.config_version >= configVersion,
        );

        release =
            compatibleReleases.find((r) => r.mono === hasDotNET) ??
            compatibleReleases[0];
    }

    if (!release) {
        return {
            success: false,
            error: t('projects:addProject.errors.noCompatibleRelease', {
                version: releaseBaseVersion,
                configVersion: configVersion,
            }),
        };
    }

    let config: ProjectConfig | null = null;
    if (release && !addAsMissingEditor) {
        config = getProjectDefinition(
            release?.version_number || 0,
            DEFAULT_PROJECT_DEFINITION,
        );
    }
    if (!config && !addAsMissingEditor) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidConfigVersion'),
        };
    }

    // set launch path
    const projectEditorPath = path.resolve(
        prefs.install_location,
        EDITOR_CONFIG_DIRNAME,
        sanitiseProjectDirectoryName(projectName),
    );
    let editorConfigFileName = '';
    let editorSettingsFile = '';

    let launch_path = '';

    if (release && !addAsMissingEditor) {
        const activeConfig = config;
        if (!activeConfig) {
            return {
                success: false,
                error: t('projects:addProject.errors.invalidConfigVersion'),
            };
        }

        logger.debug('Setting project editor release', release);
        // launch_path = await setEditorSymlink(projectEditorPath, release.editor_path);
        launch_path = await SetProjectEditorRelease(projectEditorPath, release);
        editorConfigFileName = activeConfig.editorConfigFilename(
            release.version_number,
        );
    }

    const gitInspection = await gitService?.inspectRepository(dirname);
    const withGit = gitInspection?.status === 'inside-work-tree';
    const configuredIntegrationIds =
        await codeEditorIntegrationService.findConfiguredIntegrations(dirname);
    const codeEditorId =
        configuredIntegrationIds.length === 1
            ? configuredIntegrationIds[0]
            : null;
    if (configuredIntegrationIds.length > 1) {
        logger.warn(
            `Multiple code editor integrations are configured for '${projectName}'; importing with no code editor selected`,
        );
    }

    const recoveredCodeEditorConfigFiles = new Set<string>();

    if (release && !addAsMissingEditor && codeEditorId) {
        const activeConfig = config;
        if (!activeConfig) {
            return {
                success: false,
                error: t('projects:addProject.errors.invalidConfigVersion'),
            };
        }

        editorSettingsFile = path.resolve(
            projectEditorPath,
            'editor_data',
            editorConfigFileName,
        );

        if (
            (await codeEditorIntegrationService.getSelectionEligibility(
                codeEditorId,
            )) === 'eligible'
        ) {
            const applied = await codeEditorIntegrationService.applyToProject(
                codeEditorId,
                {
                    projectPath: dirname,
                    godotLaunchPath: launch_path,
                    godotVersion: release.version_number,
                    mono: release.mono,
                    editorSettingsFile,
                    editorSettingsFilename: editorConfigFileName,
                    editorSettingsFormat: activeConfig.editorConfigFormat,
                },
            );
            editorSettingsFile = applied.editorSettingsFile;
            for (const recoveredFile of applied.recoveredConfigFiles) {
                recoveredCodeEditorConfigFiles.add(recoveredFile);
            }
        }
    }

    const project: ProjectDetails = {
        path: dirname,
        name: projectName,
        icon_path: getProjectIconUrlFromParsed(dirname, parsedConfig),
        version:
            release?.version ?? `${releaseBaseVersion.toFixed(1)} (missing)`,
        version_number: release?.version_number ?? releaseBaseVersion,
        renderer,
        added_at: new Date(),
        last_opened: null,
        launch_path,
        editor_settings_path: editorSettingsFile
            ? path.dirname(editorSettingsFile)
            : '',
        editor_settings_file: editorSettingsFile
            ? path.resolve(
                  path.dirname(editorSettingsFile),
                  editorConfigFileName,
              )
            : '',
        config_version: configVersion as 5,
        withGit,
        codeEditorId,
        valid: !addAsMissingEditor,
        invalid_reason: addAsMissingEditor ? 'missing_editor' : undefined,
        release: {
            ...release,
            config_version: configVersion as 5,
            editor_path: release?.editor_path ?? '',
            install_path: release?.install_path ?? '',
            mono: release?.mono ?? false,
            platform: release?.platform ?? '',
            arch: release?.arch ?? '',
            prerelease: release?.prerelease ?? false,
            version: release?.version ?? releaseBaseVersion.toString(),
            version_number: release?.version_number ?? releaseBaseVersion,
            published_at: release?.published_at ?? null,
            valid: !addAsMissingEditor,
        },
    };

    if (shouldWriteProjectLauncherConfig) {
        await writeProjectLauncherConfig(dirname, {
            release: project.release,
            launcherVersion: app.getVersion(),
        });
    }

    const allProjects = await addProjectToList(projectListPath, project);

    return {
        success: true,
        projects: allProjects,
        newProject: project,
        recoveredCodeEditorConfigFiles:
            recoveredCodeEditorConfigFiles.size > 0
                ? [...recoveredCodeEditorConfigFiles]
                : undefined,
    };
}
