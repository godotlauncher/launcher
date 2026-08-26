import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    AddProjectEditorResolution,
    AddProjectOptions,
    AddProjectToListResult,
    InstalledRelease,
    ProjectConfig,
    ProjectDetails,
    ProjectInferredEditorRequest,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { getUserPreferences } from '../commands/userPreferences.js';
import {
    EDITOR_CONFIG_DIRNAME,
    PROJECT_LAUNCHER_CONFIG_FILENAME,
} from '../constants.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { InstalledEditorService } from '../editor-installs/installed-editor.service.js';
import { t } from '../i18n/index.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    type GodotProjectFile,
    getProjectConfigVersionFromParsed,
    getProjectGodotVersionFromParsed,
    getProjectIconUrlFromParsed,
    getProjectNameFromParsed,
    getProjectRendererFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import {
    getReleaseBaseVersion,
    getReleaseChannel,
    getReleaseFlavor,
    type ProjectLauncherConfig,
    readProjectLauncherConfig,
    writeProjectLauncherConfig,
} from '../utils/projectLauncherConfig.utils.js';
import { sortReleases } from '../utils/releaseSorting.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

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
    const requested = {
        kind: 'exact' as const,
        ...launcherConfig.editor,
    };

    return {
        requested,
        fallback,
        downloadable:
            requested.channel === 'official'
                ? {
                      match: 'exact',
                      version: requested.version,
                      flavor: requested.flavor,
                      prerelease: !requested.version
                          .toLowerCase()
                          .includes('stable'),
                  }
                : undefined,
    };
}

/**
 * Creates a missing-editor resolution for a Godot branch inferred from the
 * project file.
 *
 * @param request - Inferred official stable editor request.
 * @returns A resolution that the renderer can match to the latest patch.
 */
function createInferredEditorResolution(
    request: ProjectInferredEditorRequest,
): AddProjectEditorResolution {
    return {
        requested: request,
        downloadable: {
            match: 'stable-base',
            base_version: request.base_version,
            flavor: request.flavor,
        },
    };
}

/**
 * Selects the newest installed official stable editor for an inferred request.
 *
 * @param releases - Installed editor releases.
 * @param request - Inferred official stable editor request.
 * @param configVersion - Project file format version that must be supported.
 * @returns The newest compatible installed release, when present.
 */
function findInferredStableRelease(
    releases: InstalledRelease[],
    request: ProjectInferredEditorRequest,
    configVersion: number,
): InstalledRelease | undefined {
    return releases
        .filter(
            (release) =>
                release.valid &&
                release.config_version >= configVersion &&
                release.source !== 'custom' &&
                !release.prerelease &&
                release.version.toLowerCase().includes('stable') &&
                getReleaseBaseVersion(release) === request.base_version &&
                getReleaseFlavor(release) === request.flavor,
        )
        .sort(sortReleases)[0];
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
 * Builds a placeholder release for an unavailable inferred stable editor.
 *
 * @param request - Inferred official stable editor request.
 * @param configVersion - Project file format version.
 * @returns An invalid release record that keeps the project addable.
 */
function buildMissingInferredRelease(
    request: ProjectInferredEditorRequest,
    configVersion: number,
): InstalledRelease {
    const versionNumber = Number.parseFloat(request.base_version);

    return {
        version: `${request.base_version}-stable`,
        base_version: request.base_version,
        flavor: request.flavor,
        version_number: Number.isNaN(versionNumber) ? 0 : versionNumber,
        install_path: '',
        editor_path: '',
        platform: process.platform,
        arch: process.arch,
        mono: request.flavor === 'dotnet',
        prerelease: false,
        config_version: configVersion as 5,
        published_at: null,
        valid: false,
        source: 'official',
    };
}

/** Owns the transactional Add Project workflow. */
@Injectable()
export class ProjectImportService {
    /**
     * Creates the project import service.
     *
     * @param codeEditors - Code editor integration facade.
     * @param installedEditors - Installed Godot editor facade.
     * @param git - Guarded Git command service.
     * @param store - Canonical project persistence store.
     */
    constructor(
        private readonly codeEditors: CodeEditorIntegrationService,
        private readonly installedEditors: InstalledEditorService,
        private readonly git: GitService,
        private readonly store: ProjectsStore,
    ) {}

    /**
     * Imports an existing Godot project into the Launcher project list.
     *
     * @param projectPath - Path to the project's project.godot file.
     * @param options - Optional code-editor choice and missing-editor resolution.
     * @returns The project import result.
     */
    async addProject(
        projectPath: string,
        options: AddProjectOptions = {},
    ): Promise<AddProjectToListResult> {
        const prefs = await getUserPreferences();

        // check if project already exist based on path
        const projects = await this.store.list();

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
            const projectFile = await fs.promises.readFile(
                projectPath,
                'utf-8',
            );
            parsedConfig = parseGodotProjectFile(projectFile);
            if (!parsedConfig) {
                throw new Error(
                    t('projects:addProject.errors.invalidProjectFile'),
                );
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

        const configVersion =
            await getProjectConfigVersionFromParsed(parsedConfig);
        const projectGodotVersion =
            getProjectGodotVersionFromParsed(parsedConfig);

        // select the closest installed release
        const installedReleases =
            await this.installedEditors.getInstalledEditors();
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
        const inferredEditorRequest: ProjectInferredEditorRequest | null =
            projectGodotVersion
                ? {
                      kind: 'stable-base',
                      channel: 'official',
                      flavor: hasDotNET ? 'dotnet' : 'gdscript',
                      base_version: projectGodotVersion,
                  }
                : null;

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
                release = buildMissingRelease(
                    projectLauncherConfig,
                    configVersion,
                );
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
        } else if (inferredEditorRequest) {
            if (options.resolution === 'add_missing') {
                release = buildMissingInferredRelease(
                    inferredEditorRequest,
                    configVersion,
                );
                addAsMissingEditor = true;
                shouldWriteProjectLauncherConfig = false;
            } else {
                release = findInferredStableRelease(
                    installedReleases,
                    inferredEditorRequest,
                    configVersion,
                );

                if (!release) {
                    return {
                        success: false,
                        editorResolution: createInferredEditorResolution(
                            inferredEditorRequest,
                        ),
                    };
                }
            }
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
            launch_path = await SetProjectEditorRelease(
                projectEditorPath,
                release,
            );
            editorConfigFileName = activeConfig.editorConfigFilename(
                release.version_number,
            );
        }

        const gitInspection = await this.git.inspectRepository(dirname);
        const withGit = gitInspection?.status === 'inside-work-tree';
        let codeEditorId = options.codeEditorId ?? null;
        if (options.codeEditorId === undefined) {
            codeEditorId = await this.codeEditors.resolveConfiguredIntegration(
                dirname,
                hasDotNET,
            );
        } else if (options.codeEditorId !== null) {
            try {
                await this.codeEditors.assertIntegrationSelectable(
                    options.codeEditorId,
                );
            } catch (error) {
                return {
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : t('projects:messages.addProjectError'),
                };
            }
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
                (await this.codeEditors.getSelectionEligibility(
                    codeEditorId,
                )) === 'eligible'
            ) {
                const applied = await this.codeEditors.applyToProject(
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
                release?.version ??
                `${releaseBaseVersion.toFixed(1)} (missing)`,
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

        const allProjects = await this.store.put(project);

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
}
