import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    CodeEditorId,
    CreateProjectGitOptions,
    CreateProjectResult,
    GitLfsTrackingPolicy,
    GitRepositoryInfo,
    InstalledRelease,
    ProjectGitLfsRecovery,
    ProjectGitLfsSetupOutcome,
    ProjectGitSetupOutcome,
    RendererType,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { getUserPreferences } from '../commands/userPreferences.js';
import {
    EDITOR_CONFIG_DIRNAME,
    MIN_VERSION,
    PROJECT_RESOURCES_DIRNAME,
    TEMPLATE_DIR_NAME,
} from '../constants.js';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitLfsService } from '../tool-integration/integrations/git-lfs/git-lfs.service.js';
import type { GitLfsConfigurationResult } from '../tool-integration/integrations/git-lfs/git-lfs.types.js';
import {
    createProjectFile,
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

/**
 * Verifies that a project directory is exactly its current repository root.
 *
 * @param gitService - Typed Git command service.
 * @param projectPath - Project directory to inspect.
 * @returns Information about the verified project repository.
 */
async function requireProjectRepositoryRoot(
    gitService: GitService,
    projectPath: string,
): Promise<GitRepositoryInfo> {
    const inspection = await gitService.inspectRepository(projectPath);
    if (
        inspection.status !== 'inside-work-tree' ||
        !inspection.isProjectRoot ||
        inspection.kind !== 'standard'
    ) {
        throw new Error(t('createProject:errors.failedGitInit'));
    }
    return {
        root: inspection.root,
        isProjectRoot: inspection.isProjectRoot,
        kind: inspection.kind,
    };
}

/**
 * Records the directly contained top-level entry created for one project path.
 *
 * @param entries - Attempt-owned top-level entry names.
 * @param projectPath - Exact project root.
 * @param createdPath - File or directory created by the attempt.
 */
function recordCreatedEntry(
    entries: Set<string>,
    projectPath: string,
    createdPath: string,
): void {
    const relativePath = path.relative(projectPath, createdPath);
    if (
        !relativePath ||
        path.isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`)
    ) {
        throw new Error('Invalid project recovery target');
    }
    entries.add(relativePath.split(path.sep)[0]);
}

/**
 * Restores a failed project attempt without inspecting or changing its parent.
 *
 * @param projectPath - Exact project root.
 * @param rootExisted - Whether the user supplied an existing empty root.
 * @param entries - Attempt-owned top-level entry names.
 * @returns Whether recovery completed without an error.
 */
async function recoverProjectAttempt(
    projectPath: string,
    rootExisted: boolean,
    entries: ReadonlySet<string>,
): Promise<boolean> {
    try {
        if (!rootExisted) {
            await fs.promises.rm(projectPath, { recursive: true, force: true });
            return true;
        }

        for (const entry of entries) {
            const target = path.resolve(projectPath, entry);
            if (path.dirname(target) !== projectPath) {
                return false;
            }
            await fs.promises.rm(target, { recursive: true, force: true });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Maps an internal Git LFS result to the shared project setup contract.
 *
 * @param result - Internal Git LFS configuration result.
 * @param recovery - Recovery state for the failed attempt.
 * @returns Renderer-safe Git LFS setup outcome.
 */
function toGitLfsSetupOutcome(
    result: Exclude<GitLfsConfigurationResult, { status: 'configured' }>,
    recovery: ProjectGitLfsRecovery,
): ProjectGitLfsSetupOutcome {
    return result.status === 'unavailable'
        ? { status: 'unavailable', recovery }
        : { ...result, recovery };
}

/**
 * Selects the translated error for one Git LFS configuration result.
 *
 * @param result - Internal Git LFS configuration result.
 * @returns Localised setup failure message.
 */
function getGitLfsFailureMessage(
    result: Exclude<GitLfsConfigurationResult, { status: 'configured' }>,
): string {
    if (result.status === 'unavailable') {
        return t('createProject:errors.gitLfsUnavailable');
    }
    if (result.stage === 'install') {
        return t('createProject:errors.failedGitLfsInstall');
    }
    if (result.stage === 'track') {
        return t('createProject:errors.failedGitLfsTrack');
    }
    return t('createProject:errors.failedGitLfsVerify');
}

/** Owns the transactional Create Project workflow. */
@Injectable()
export class ProjectCreationService {
    /**
     * Creates the project creation service.
     *
     * @param codeEditors - Code editor integration facade.
     * @param git - Guarded Git command service.
     * @param gitLfs - Guarded Git LFS service.
     * @param store - Canonical project persistence store.
     */
    constructor(
        private readonly codeEditors: CodeEditorIntegrationService,
        private readonly git: GitService,
        private readonly gitLfs: GitLfsService,
        private readonly store: ProjectsStore,
    ) {}

    /**
     * Creates a project and configures its selected editor integrations.
     *
     * @param projectName - Display name for the new project.
     * @param release - Godot editor release assigned to the project.
     * @param renderer - Renderer selected for the project.
     * @param codeEditorId - Optional code editor integration to apply.
     * @param withGit - Whether to initialise Git when it is available.
     * @param overwriteProjectPath - Optional path used to choose the project parent directory.
     * @param gitOptions - Optional initial commit, identity, and Git LFS setup choice.
     * @returns The project creation result.
     */
    async createProject(
        projectName: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ): Promise<CreateProjectResult> {
        let gitSetup: ProjectGitSetupOutcome = { status: 'not-requested' };
        let gitLfsSetup: ProjectGitLfsSetupOutcome = {
            status: 'not-requested',
        };
        const gitLfsRequested = gitOptions?.gitLfs !== undefined;
        const requestedGitLfsPolicy = gitOptions?.gitLfs?.trackingPolicy;
        let validatedGitLfsPolicy: GitLfsTrackingPolicy | null = null;
        if (codeEditorId) {
            try {
                await this.codeEditors.assertIntegrationSelectable(
                    codeEditorId,
                );
            } catch (error) {
                return {
                    success: false,
                    error:
                        error instanceof Error ? error.message : String(error),
                };
            }
        }

        if (gitLfsRequested && !withGit) {
            return {
                success: false,
                error: t('createProject:errors.gitLfsRequiresGit'),
                gitLfsSetup: {
                    status: 'failed',
                    stage: 'verify',
                    recovery: 'not-required',
                },
            };
        }

        if (withGit && !(await this.git.exists())) {
            if (gitLfsRequested) {
                return {
                    success: false,
                    error: t('createProject:errors.gitLfsRequiresGit'),
                    gitSetup: { status: 'git-unavailable' },
                    gitLfsSetup: {
                        status: 'failed',
                        stage: 'verify',
                        recovery: 'not-required',
                    },
                };
            }
            logger.warn(
                'Create Project with Git, but Git is not installed. Setting withGit to false',
            );
            withGit = false;
            gitSetup = { status: 'git-unavailable' };
        }

        projectName = projectName.trim();
        const projectDirectoryName = sanitiseProjectDirectoryName(
            projectName.replaceAll(' ', '-'),
        );

        const { projects_location: projectDir, install_location: installDir } =
            await getUserPreferences();
        logger.info(overwriteProjectPath);
        const projectPath = overwriteProjectPath
            ? path.resolve(
                  path.dirname(overwriteProjectPath),
                  projectDirectoryName,
              )
            : path.resolve(projectDir, projectDirectoryName);
        const projectRootExisted = fs.existsSync(projectPath);

        // If the target exists, allow it only when it's an empty directory.
        if (projectRootExisted) {
            const stat = await fs.promises.lstat(projectPath);

            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: t('createProject:errors.pathNotDirectory'),
                };
            }

            const entries = await fs.promises.readdir(projectPath);
            if (entries.length > 0) {
                return {
                    success: false,
                    error: t('createProject:errors.folderNotEmpty', {
                        name: projectName,
                    }),
                };
            }
        }

        if (gitLfsRequested) {
            if (!this.gitLfs.supportsTrackingPolicy(requestedGitLfsPolicy)) {
                return {
                    success: false,
                    error: t('createProject:errors.failedGitLfsVerify'),
                    gitLfsSetup: {
                        status: 'failed',
                        stage: 'verify',
                        recovery: 'not-required',
                    },
                };
            }
            validatedGitLfsPolicy = requestedGitLfsPolicy;
            if (!(await this.gitLfs.isAvailable())) {
                return {
                    success: false,
                    error: t('createProject:errors.gitLfsUnavailable'),
                    gitLfsSetup: {
                        status: 'unavailable',
                        recovery: 'not-required',
                    },
                };
            }
            const inspection = await this.git.inspectRepository(projectPath);
            if (inspection.status === 'inside-work-tree') {
                return {
                    success: false,
                    error: t('createProject:errors.gitLfsExistingRepository'),
                    gitSetup: {
                        status: 'existing-repository',
                        root: inspection.root,
                        isProjectRoot: inspection.isProjectRoot,
                        kind: inspection.kind,
                    },
                    gitLfsSetup: {
                        status: 'failed',
                        stage: 'verify',
                        recovery: 'not-required',
                    },
                };
            }
            if (inspection.status !== 'not-a-repository') {
                return {
                    success: false,
                    error: t('createProject:errors.failedGitLfsVerify'),
                    gitLfsSetup: {
                        status: 'failed',
                        stage: 'verify',
                        recovery: 'not-required',
                    },
                };
            }
        }

        // get the editor version, make sure it's a number and greater than the minimum version
        const version = release.version_number;
        if (!version || Number.isNaN(version) || version < MIN_VERSION) {
            return {
                success: false,
                error: t('createProject:errors.invalidEditorVersion', {
                    version: version.toString(),
                }),
            };
        }

        const assetsDir = getAssetPath();
        const templatesDir = path.resolve(assetsDir, TEMPLATE_DIR_NAME);
        const projectResDir = path.resolve(
            assetsDir,
            PROJECT_RESOURCES_DIRNAME,
        );

        // get the project definition
        const config = getProjectDefinition(
            version,
            DEFAULT_PROJECT_DEFINITION,
        );

        if (!config) {
            return {
                success: false,
                error: t('createProject:errors.failedProjectDefinition', {
                    version: version.toString(),
                }),
            };
        }

        const createdEntries = new Set<string>();

        try {
            // create project file
            let projectFile: string;

            try {
                projectFile = await createProjectFile(
                    templatesDir,
                    config.configVersion,
                    release.version_number,
                    projectName,
                    renderer,
                );
            } catch (e) {
                return {
                    success: false,
                    error: t('createProject:errors.failedCreateFile', {
                        error: String(e),
                    }),
                };
            }
            const parsedProjectFile = parseGodotProjectFile(projectFile);

            await fs.promises.mkdir(projectPath, { recursive: true });
            // write project file
            recordCreatedEntry(
                createdEntries,
                projectPath,
                path.resolve(projectPath, config.projectFilename),
            );
            await fs.promises.writeFile(
                path.resolve(projectPath, config.projectFilename),
                projectFile,
            );

            // move resources
            for (const resource of config.resources) {
                const src = path.resolve(projectResDir, resource.src);
                const dst = path.resolve(projectPath, resource.dst);
                const dstDir = path.dirname(
                    path.resolve(projectPath, resource.dst),
                );

                if (!fs.existsSync(src)) {
                    logger.error('Resource not found', src);
                    continue;
                }
                if (!fs.existsSync(dstDir)) {
                    await fs.promises.mkdir(dstDir, { recursive: true });
                }

                recordCreatedEntry(createdEntries, projectPath, dst);
                await fs.promises.copyFile(src, dst);
            }

            recordCreatedEntry(
                createdEntries,
                projectPath,
                path.resolve(projectPath, '.godotlauncher'),
            );
            await writeProjectLauncherConfig(projectPath, {
                release,
                launcherVersion: app.getVersion(),
            });

            recordCreatedEntry(
                createdEntries,
                projectPath,
                path.resolve(projectPath, '.gitignore'),
            );
            await fs.promises.copyFile(
                path.resolve(projectResDir, 'default_gitignore'),
                path.resolve(projectPath, '.gitignore'),
            );
            recordCreatedEntry(
                createdEntries,
                projectPath,
                path.resolve(projectPath, '.gitattributes'),
            );
            await fs.promises.copyFile(
                path.resolve(projectResDir, 'default-gitattributes'),
                path.resolve(projectPath, '.gitattributes'),
            );

            // Initialize only when the project is not already covered by a work tree.
            if (withGit) {
                let inspection = await this.git.inspectRepository(projectPath);
                if (inspection.status === 'inspection-failed') {
                    throw new Error(t('createProject:errors.failedGitInit'));
                }
                if (inspection.status === 'git-unavailable') {
                    withGit = false;
                    gitSetup = { status: 'git-unavailable' };
                } else if (inspection.status === 'inside-work-tree') {
                    gitSetup = {
                        status: 'existing-repository',
                        root: inspection.root,
                        isProjectRoot: inspection.isProjectRoot,
                        kind: inspection.kind,
                    };
                } else {
                    recordCreatedEntry(
                        createdEntries,
                        projectPath,
                        path.resolve(projectPath, '.git'),
                    );
                    if (!(await this.git.init(projectPath))) {
                        inspection =
                            await this.git.inspectRepository(projectPath);
                        if (inspection.status === 'inside-work-tree') {
                            gitSetup = {
                                status: 'existing-repository',
                                root: inspection.root,
                                isProjectRoot: inspection.isProjectRoot,
                                kind: inspection.kind,
                            };
                        } else {
                            throw new Error(
                                t('createProject:errors.failedGitInit'),
                            );
                        }
                    } else {
                        const repository = await requireProjectRepositoryRoot(
                            this.git,
                            projectPath,
                        );
                        gitSetup = {
                            status: 'initialized',
                            ...repository,
                        };
                    }
                }

                if (gitLfsRequested && gitSetup.status !== 'initialized') {
                    const recovered = await recoverProjectAttempt(
                        projectPath,
                        projectRootExisted,
                        createdEntries,
                    );
                    return {
                        success: false,
                        projectPath: recovered ? undefined : projectPath,
                        error: recovered
                            ? t('createProject:errors.gitLfsExistingRepository')
                            : t('createProject:errors.failedProjectRecovery', {
                                  path: projectPath,
                              }),
                        gitSetup,
                        gitLfsSetup: {
                            status: 'failed',
                            stage: 'verify',
                            recovery: recovered ? 'completed' : 'failed',
                        },
                    };
                }

                if (gitSetup.status === 'initialized') {
                    if (validatedGitLfsPolicy) {
                        const lfsResult =
                            await this.gitLfs.configureProjectRepository(
                                projectPath,
                                validatedGitLfsPolicy,
                            );
                        if (lfsResult.status !== 'configured') {
                            const recovered = await recoverProjectAttempt(
                                projectPath,
                                projectRootExisted,
                                createdEntries,
                            );
                            const recovery = recovered ? 'completed' : 'failed';
                            return {
                                success: false,
                                projectPath: recovered
                                    ? undefined
                                    : projectPath,
                                error: recovered
                                    ? getGitLfsFailureMessage(lfsResult)
                                    : t(
                                          'createProject:errors.failedProjectRecovery',
                                          { path: projectPath },
                                      ),
                                gitSetup,
                                gitLfsSetup: toGitLfsSetupOutcome(
                                    lfsResult,
                                    recovery,
                                ),
                            };
                        }
                        gitLfsSetup = lfsResult;
                    }
                    if (!(await this.git.renameBranch(projectPath))) {
                        throw new Error(
                            t('createProject:errors.failedGitBranch'),
                        );
                    }

                    const resolvedGitOptions = gitOptions ?? {
                        initialCommit: 'create',
                    };
                    if (resolvedGitOptions.initialCommit === 'create') {
                        if (resolvedGitOptions.identity) {
                            const name =
                                resolvedGitOptions.identity.name.trim();
                            const email =
                                resolvedGitOptions.identity.email.trim();
                            const { scope } = resolvedGitOptions.identity;
                            if (
                                !name ||
                                !email ||
                                (scope !== 'repository' && scope !== 'global')
                            ) {
                                throw new Error(
                                    t(
                                        'createProject:errors.invalidGitIdentity',
                                    ),
                                );
                            }
                            await requireProjectRepositoryRoot(
                                this.git,
                                projectPath,
                            );
                            if (
                                !(await this.git.setIdentity(
                                    name,
                                    email,
                                    scope,
                                    projectPath,
                                ))
                            ) {
                                throw new Error(
                                    t('createProject:errors.failedGitIdentity'),
                                );
                            }
                        }

                        if (!(await this.git.addAndCommit(projectPath))) {
                            throw new Error(
                                t('createProject:errors.failedGitCommit'),
                            );
                        }
                    }
                }
            }

            // Configure the editor only after all requested repository setup succeeds.
            const projectEditorPath = path.resolve(
                installDir,
                EDITOR_CONFIG_DIRNAME,
                projectDirectoryName,
            );
            const launch_path = await SetProjectEditorRelease(
                projectEditorPath,
                release,
            );

            let editorSettingsPath = path.resolve(
                path.dirname(launch_path),
                'editor_data',
                config.editorConfigFilename(release.version_number),
            );

            if (codeEditorId) {
                const applied = await this.codeEditors.applyToProject(
                    codeEditorId,
                    {
                        projectPath,
                        godotLaunchPath: launch_path,
                        godotVersion: release.version_number,
                        mono: release.mono,
                        editorSettingsFile: editorSettingsPath,
                        editorSettingsFilename: config.editorConfigFilename(
                            release.version_number,
                        ),
                        editorSettingsFormat: config.editorConfigFormat,
                    },
                );
                editorSettingsPath = applied.editorSettingsFile;
            }

            // setup the editor location for settings
            const result: CreateProjectResult = {
                success: true,
                projectPath,
                gitSetup,
                gitLfsSetup,
                projectDetails: {
                    name: projectName,
                    version: release.version,
                    version_number: release.version_number,
                    icon_path: getProjectIconUrlFromParsed(
                        projectPath,
                        parsedProjectFile,
                    ),
                    added_at: new Date(),
                    last_opened: null,
                    launch_path: launch_path,
                    editor_settings_path: path.dirname(editorSettingsPath),
                    editor_settings_file: editorSettingsPath,
                    path: projectPath,
                    release,
                    renderer,
                    config_version: config.configVersion,
                    codeEditorId,
                    withGit,
                    valid: true,
                },
            };

            // add project to list
            const projectDetails = result.projectDetails;
            if (!projectDetails) {
                throw new Error('Missing project details after creation');
            }
            await this.store.put(projectDetails);
            return result;
        } catch (error) {
            const recovered = await recoverProjectAttempt(
                projectPath,
                projectRootExisted,
                createdEntries,
            );
            if (gitLfsRequested && gitLfsSetup.status === 'not-requested') {
                return {
                    success: false,
                    projectPath: recovered ? undefined : projectPath,
                    error: recovered
                        ? (error as Error).message
                        : t('createProject:errors.failedProjectRecovery', {
                              path: projectPath,
                          }),
                    gitSetup,
                    gitLfsSetup: {
                        status: 'failed',
                        stage: 'verify',
                        recovery: recovered ? 'completed' : 'failed',
                    },
                };
            }
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }
}
