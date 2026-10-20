import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    ChangeProjectEditorResult,
    CodeEditorId,
    InstalledRelease,
    OpenProjectCodeEditorResult,
    ProjectDetails,
    ProjectEditorSelection,
    ProjectEditorSelectionExpectation,
    SetProjectCodeEditorResult,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { getUserPreferences } from '../commands/userPreferences.js';
import { EDITOR_CONFIG_DIRNAME } from '../constants.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { InstalledEditorService } from '../editor-installs/installed-editor.service.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import { publishProjectUpdates } from './project-events.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

/**
 * Identifies a catalogue selection that main must resolve before assignment.
 * @param selection - Installed editor or official catalogue selection.
 */
function isOfficialEditorSelection(
    selection: ProjectEditorSelection,
): selection is Extract<ProjectEditorSelection, { release: unknown }> {
    return 'release' in selection;
}

/**
 * Builds the persisted missing-editor representation for an official selection.
 *
 * @param selection - Official release selected before its installation.
 * @param project - Current project whose configuration format is retained.
 * @returns Invalid editor data that preserves the requested download identity.
 */
function createMissingOfficialRelease(
    selection: ProjectEditorSelection,
    project: ProjectDetails,
): InstalledRelease {
    if (!isOfficialEditorSelection(selection)) {
        throw new Error('An installed editor cannot be persisted as missing');
    }

    const { release, mono } = selection;
    const baseVersion =
        release.version.match(/^v?(\d+\.\d+)/)?.[1] ??
        release.version_number.toFixed(1);

    return {
        version: release.version,
        name: release.name,
        base_version: baseVersion,
        flavor: mono ? 'dotnet' : 'gdscript',
        version_number: release.version_number,
        install_path: '',
        editor_path: '',
        platform: process.platform,
        arch: process.arch,
        mono,
        prerelease: release.prerelease,
        config_version: project.config_version,
        published_at: release.published_at,
        valid: false,
        source: 'official',
    };
}

/**
 * Checks whether the project's Godot configuration file currently exists.
 *
 * @param projectPath - Root directory of the project.
 * @returns Whether project.godot is present at the project root.
 */
function hasProjectFile(projectPath: string): boolean {
    return existsSync(path.resolve(projectPath, 'project.godot'));
}

/** Owns project-specific Godot and code editor configuration. */
@Injectable()
export class ProjectEditorService {
    /**
     * Creates the project editor configuration boundary.
     * @param codeEditors - External code editor integration facade.
     * @param installedEditors - Registered Godot editors.
     * @param store - Canonical project persistence store.
     */
    constructor(
        private readonly codeEditors: CodeEditorIntegrationService,
        private readonly installedEditors: InstalledEditorService,
        private readonly store: ProjectsStore,
    ) {}

    /**
     * Changes the Godot editor assigned to a project.
     *
     * @param project - Project to update.
     * @param selection - Installed editor or official editor selection to assign.
     * @param expectedEditor - Optional current selection required for repair.
     */
    async setProjectEditor(
        project: ProjectDetails,
        selection: ProjectEditorSelection,
        expectedEditor?: ProjectEditorSelectionExpectation,
    ): Promise<ChangeProjectEditorResult> {
        const installedRelease = isOfficialEditorSelection(selection)
            ? (await this.installedEditors.getInstalledEditors()).find(
                  (candidate) =>
                      candidate.source !== 'custom' &&
                      candidate.valid !== false &&
                      Boolean(candidate.editor_path) &&
                      candidate.version === selection.release.version &&
                      candidate.mono === selection.mono,
              )
            : selection;
        const recoveredFiles = new Set<string>();
        let failure: ChangeProjectEditorResult | undefined;
        let updatedProject: ProjectDetails | undefined;

        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                if (expectedEditor) {
                    return currentProjects;
                }
                failure = {
                    success: false,
                    error: t('projects:changeEditor.errors.projectNotFound'),
                };
                return currentProjects;
            }

            const currentProject = currentProjects[projectIndex];
            if (
                expectedEditor &&
                (currentProject.release.version !== expectedEditor.version ||
                    currentProject.release.mono !== expectedEditor.mono ||
                    currentProject.release.source === 'custom')
            ) {
                return currentProjects;
            }

            const release =
                installedRelease ??
                createMissingOfficialRelease(selection, currentProject);
            if (
                currentProject.release.version === release.version &&
                currentProject.release.mono === release.mono &&
                currentProject.release.editor_path === release.editor_path &&
                currentProject.release.valid === release.valid &&
                installedRelease !== undefined
            ) {
                logger.warn(
                    `Project already using the selected release, ${release.version} - ${release.mono ? 'mono' : ''}`,
                );
                return currentProjects;
            }

            const config = getProjectDefinition(
                release.version_number,
                DEFAULT_PROJECT_DEFINITION,
            );
            if (!config) {
                failure = {
                    success: false,
                    error: t(
                        'projects:changeEditor.errors.invalidEditorVersion',
                    ),
                };
                return currentProjects;
            }
            if (
                parseInt(currentProject.version_number.toString(), 10) !==
                parseInt(release.version_number.toString(), 10)
            ) {
                failure = {
                    success: false,
                    error: t(
                        'projects:changeEditor.errors.differentMajorVersion',
                    ),
                };
                return currentProjects;
            }

            if (!installedRelease) {
                updatedProject = {
                    ...currentProject,
                    release,
                    version: release.version,
                    version_number: release.version_number,
                    launch_path: '',
                    valid: false,
                    invalid_reason:
                        !hasProjectFile(currentProject.path) ||
                        currentProject.invalid_reason === 'missing_project_file'
                            ? 'missing_project_file'
                            : 'missing_editor',
                };
                await writeProjectLauncherConfig(updatedProject.path, {
                    release: updatedProject.release,
                    projectName: updatedProject.name,
                    launcherVersion: app.getVersion(),
                });

                const updatedProjects = [...currentProjects];
                updatedProjects[projectIndex] = updatedProject;
                return updatedProjects;
            }

            const { install_location: installLocation } =
                await getUserPreferences();
            const projectEditorPath = resolveProjectEditorPath(
                currentProject,
                installLocation,
            );
            const newLaunchPath = await SetProjectEditorRelease(
                projectEditorPath,
                release,
                currentProject.release,
                currentProject.exportTemplateMode,
                currentProject.exportTemplateBuilds,
            );
            const editorSettingsFilename = config.editorConfigFilename(
                release.version_number,
            );
            let newEditorSettingsFile = path.resolve(
                projectEditorPath,
                'editor_data',
                editorSettingsFilename,
            );

            if (currentProject.codeEditorId) {
                const installation = await this.codeEditors.scanIntegration(
                    currentProject.codeEditorId,
                );
                if (installation) {
                    const applied = await this.codeEditors.applyToProject(
                        currentProject.codeEditorId,
                        {
                            projectPath: currentProject.path,
                            godotLaunchPath: newLaunchPath,
                            godotVersion: release.version_number,
                            mono: release.mono,
                            editorSettingsFile: newEditorSettingsFile,
                            editorSettingsFilename,
                            editorSettingsFormat: config.editorConfigFormat,
                        },
                    );
                    newEditorSettingsFile = applied.editorSettingsFile;
                    for (const recoveredFile of applied.recoveredConfigFiles) {
                        recoveredFiles.add(recoveredFile);
                    }
                }
            } else {
                await this.codeEditors.disableForProject(
                    newEditorSettingsFile,
                    release.mono ? 'dotnet' : 'standard',
                );
            }

            const projectFileExists = hasProjectFile(currentProject.path);
            updatedProject = {
                ...currentProject,
                release: { ...release, valid: true },
                version: release.version,
                version_number: release.version_number,
                launch_path: newLaunchPath,
                editor_settings_path: path.resolve(
                    path.dirname(newEditorSettingsFile),
                ),
                editor_settings_file: newEditorSettingsFile,
                valid: projectFileExists,
                invalid_reason: projectFileExists
                    ? undefined
                    : 'missing_project_file',
            };
            await writeProjectLauncherConfig(updatedProject.path, {
                release: updatedProject.release,
                projectName: updatedProject.name,
                launcherVersion: app.getVersion(),
            });

            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = updatedProject;
            return updatedProjects;
        });

        if (failure) {
            return failure;
        }

        if (updatedProject) {
            project.release = updatedProject.release;
            project.version = updatedProject.version;
            project.version_number = updatedProject.version_number;
            project.launch_path = updatedProject.launch_path;
            project.editor_settings_file = updatedProject.editor_settings_file;
            project.editor_settings_path = updatedProject.editor_settings_path;
            project.valid = updatedProject.valid;
            project.codeEditorId = updatedProject.codeEditorId;
            void updateLinuxTray();
        }

        return {
            success: true,
            projects,
            recoveredCodeEditorConfigFiles:
                recoveredFiles.size > 0 ? [...recoveredFiles] : undefined,
        };
    }

    /**
     * Changes the code editor assigned to a project.
     *
     * @param project - Project to update.
     * @param codeEditorId - Code editor to assign, or null to disable it.
     */
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) {
        return this.updateProjectCodeEditor(project, codeEditorId, false);
    }

    /**
     * Resets Launcher-owned code editor configuration for a project.
     *
     * @param project - Project whose configuration should be reset.
     */
    resetProjectCodeEditorConfig(project: ProjectDetails) {
        return this.updateProjectCodeEditor(project, null, true);
    }

    /**
     * Opens a stored project's folder without changing its Godot launch state.
     * @param projectPath - Exact registered project folder.
     */
    async openProjectCodeEditor(
        projectPath: string,
    ): Promise<OpenProjectCodeEditorResult> {
        const project = (await this.store.list()).find(
            (candidate) => candidate.path === projectPath,
        );
        if (
            !project ||
            !(await stat(project.path)
                .then((value) => value.isDirectory())
                .catch(() => false))
        ) {
            return { success: false, reason: 'project-unavailable' };
        }
        if (!project.codeEditorId)
            return { success: false, reason: 'editor-not-configured' };
        return this.codeEditors.openProjectFolder(
            project.codeEditorId,
            project.path,
        );
    }

    /**
     * Applies or reapplies a code editor selection and persists the project.
     *
     * @param project - Project to update.
     * @param requestedCodeEditorId - Requested editor, or null to disable it.
     * @param reapply - Whether to reapply the existing selection.
     */
    private async updateProjectCodeEditor(
        project: ProjectDetails,
        requestedCodeEditorId: CodeEditorId | null,
        reapply: boolean,
    ): Promise<SetProjectCodeEditorResult> {
        const recoveredFiles = new Set<string>();
        let updatedProject: ProjectDetails | undefined;
        let unchanged = false;

        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                throw new Error(
                    t('projects:setCodeEditor.errors.projectNotFound'),
                );
            }

            const targetProject: ProjectDetails = {
                ...currentProjects[projectIndex],
                release: { ...currentProjects[projectIndex].release },
            };
            const currentCodeEditorId = targetProject.codeEditorId;
            const codeEditorId = reapply
                ? currentCodeEditorId
                : requestedCodeEditorId;

            if (reapply && !codeEditorId) {
                throw new Error(
                    t('projects:setCodeEditor.errors.noEditorSelected'),
                );
            }
            if (
                !reapply &&
                codeEditorId &&
                currentCodeEditorId === codeEditorId
            ) {
                unchanged = true;
                updatedProject = targetProject;
                return currentProjects;
            }

            if (codeEditorId) {
                const recovered = await this.applyCodeEditorConfiguration(
                    targetProject,
                    codeEditorId,
                    reapply ? null : currentCodeEditorId,
                );
                for (const recoveredFile of recovered) {
                    recoveredFiles.add(recoveredFile);
                }
            } else {
                await this.codeEditors.disableForProject(
                    targetProject.editor_settings_file,
                    targetProject.release.mono ? 'dotnet' : 'standard',
                );
            }

            targetProject.codeEditorId = codeEditorId;
            updatedProject = targetProject;
            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = targetProject;
            return updatedProjects;
        });

        const latestProject =
            projects.find((candidate) => candidate.path === project.path) ??
            updatedProject;
        if (!latestProject) {
            throw new Error(t('projects:setCodeEditor.errors.projectNotFound'));
        }

        if (!unchanged) {
            publishProjectUpdates(projects);
        }
        project.codeEditorId = latestProject.codeEditorId;
        project.editor_settings_file = latestProject.editor_settings_file;
        project.editor_settings_path = latestProject.editor_settings_path;

        return {
            ...latestProject,
            recoveredCodeEditorConfigFiles:
                recoveredFiles.size > 0 ? [...recoveredFiles] : undefined,
        };
    }

    /**
     * Applies one code editor integration to a project configuration.
     *
     * @param project - Project configuration to update.
     * @param codeEditorId - Code editor integration to apply.
     * @param previousCodeEditorId - Previously configured integration.
     */
    private async applyCodeEditorConfiguration(
        project: ProjectDetails,
        codeEditorId: CodeEditorId,
        previousCodeEditorId: CodeEditorId | null,
    ): Promise<string[]> {
        await this.codeEditors.assertIntegrationSelectable(codeEditorId);

        if (!project.launch_path) {
            throw new Error(
                t('projects:setCodeEditor.errors.missingLaunchPath'),
            );
        }

        const definition = getProjectDefinition(
            project.release.version_number,
            DEFAULT_PROJECT_DEFINITION,
        );
        if (!definition) {
            throw new Error(
                t('projects:setCodeEditor.errors.invalidProjectDefinition'),
            );
        }

        const settingsFilename = definition.editorConfigFilename(
            project.release.version_number,
        );
        const settingsFile =
            project.editor_settings_file ||
            path.resolve(
                path.dirname(project.launch_path),
                'editor_data',
                settingsFilename,
            );
        const applied = await this.codeEditors.applyToProject(codeEditorId, {
            projectPath: project.path,
            godotLaunchPath: project.launch_path,
            godotVersion: project.release.version_number,
            mono: project.release.mono,
            editorSettingsFile: settingsFile,
            editorSettingsFilename: settingsFilename,
            editorSettingsFormat: definition.editorConfigFormat,
            previousCodeEditorId,
        });

        project.editor_settings_file = applied.editorSettingsFile;
        project.editor_settings_path = path.dirname(applied.editorSettingsFile);
        return applied.recoveredConfigFiles;
    }
}

/**
 * Resolves the isolated editor configuration directory for a project.
 *
 * @param project - Project whose editor directory is required.
 * @param installLocation - Configured editor installation location.
 * @returns The project editor directory.
 */
function resolveProjectEditorPath(
    project: ProjectDetails,
    installLocation: string,
): string {
    if (project.launch_path) {
        return path.dirname(project.launch_path);
    }
    if (project.editor_settings_file) {
        return path.dirname(path.dirname(project.editor_settings_file));
    }
    if (project.editor_settings_path) {
        return path.dirname(project.editor_settings_path);
    }

    return path.resolve(
        installLocation,
        EDITOR_CONFIG_DIRNAME,
        sanitiseProjectDirectoryName(project.name),
    );
}
