import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    EditorInstallOrigin,
    InstalledRelease,
    InstallReleaseResult,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { ConfirmButton } from '../../../components/confirm.component';
import type { DialogTone } from '../../../components/dialog.component';
import { appBridge, projectsBridge } from '../../../renderer.bridge.ts';
import {
    ProjectEditorRecoveryActions,
    ProjectEditorRecoveryDetails,
} from '../components/project-editor-recovery.component';
import { ProjectImportReview } from '../components/project-import-review.component';
import {
    type LocalImportRow,
    prepareLocalImportRow,
} from '../local-import-editor.model';
import { findDownloadableProjectEditor } from '../project-editor-resolution.model.ts';
import { getImportConflicts } from '../project-import-conflict.model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ProjectEditorInstallTarget = {
    projectPath: string;
    version: string;
    mono: boolean;
};

type AddProjectWorkflowArgs = {
    t: Translate;
    addingProject: boolean;
    projectsLocation?: string;
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    addAlert: (
        title: string,
        message: React.ReactNode,
        icon?: React.ReactNode,
    ) => void;
    addCustomConfirm: (
        title: string,
        message: React.ReactNode,
        actions: ConfirmButton[],
        icon?: React.ReactNode,
        tone?: DialogTone,
    ) => void;
    setAddingProject: (addingProject: boolean) => void;
    addProject: (
        projectPath: string,
        options?: AddProjectOptions,
    ) => Promise<AddProjectToListResult>;
    installRelease: (
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ) => Promise<InstallReleaseResult>;
    setProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ChangeProjectEditorResult>;
    showRecoveredCodeEditorConfigWarning: (recoveredFiles?: string[]) => void;
};

export function useAddProjectWorkflow({
    t,
    addingProject,
    projectsLocation,
    availableReleases,
    availablePrereleases,
    addAlert,
    addCustomConfirm,
    setAddingProject,
    addProject,
    installRelease,
    setProjectEditor,
    showRecoveredCodeEditorConfigWarning,
}: AddProjectWorkflowArgs) {
    const [localReview, setLocalReview] = useState<{
        rows: LocalImportRow[];
        existing: ProjectDetails[];
        platform: string;
        resolve: (selected: LocalImportRow[]) => void;
    } | null>(null);
    const [projectEditorInstallTargets, setProjectEditorInstallTargets] =
        useState<ProjectEditorInstallTarget[]>([]);
    const getRequestedMono = (result: AddProjectToListResult): boolean =>
        result.editorResolution?.requested.flavor === 'dotnet';

    const showAddProjectError = (error?: string) => {
        logger.error(error);
        addAlert(
            t('common:error'),
            error || t('messages.addProjectError'),
            <TriangleAlert />,
        );
    };

    /**
     * Retries project registration with the supplied options.
     *
     * @param projectPath - Project file path being registered.
     * @param options - Registration choices to preserve for the retry.
     * @returns Whether the shared result workflow added the project.
     */
    const retryAddProject = async (
        projectPath: string,
        options?: AddProjectOptions,
    ): Promise<boolean> => {
        const result = await addProject(projectPath, options);
        return handleAddProjectResult(projectPath, result, options);
    };

    /**
     * Adds the project as missing and starts editor installation and repair
     * in the background so registration can finish immediately.
     *
     * @param projectPath - Project file path being registered.
     * @param result - Initial result containing the editor requirement.
     * @param release - Editor release selected for installation.
     * @param editorChoiceId - Revalidated catalogue choice to retain while missing.
     * @param projectOptions - Registration choices to preserve while adding.
     * @param onResolution - Reopens local review when the selected action is stale.
     * @returns Whether the project was added before installation and repair.
     */
    const downloadEditorAndAddProject = async (
        projectPath: string,
        result: AddProjectToListResult,
        release: ReleaseSummary,
        editorChoiceId: string | undefined,
        projectOptions: AddProjectOptions,
        onResolution?: (result: AddProjectToListResult) => Promise<boolean>,
    ): Promise<boolean> => {
        const mono = getRequestedMono(result);
        const addMissingResult = await addProject(projectPath, {
            ...projectOptions,
            resolution: 'add_missing',
            ...(editorChoiceId ? { editorChoiceId } : {}),
        });

        if (
            onResolution &&
            (addMissingResult.importConflict ||
                addMissingResult.editorResolution)
        ) {
            return onResolution(addMissingResult);
        }
        if (!addMissingResult.success || !addMissingResult.newProject) {
            showAddProjectError(addMissingResult.error);
            return false;
        }

        const addedProject = addMissingResult.newProject;
        const installTarget = {
            projectPath,
            version: release.version,
            mono,
        };
        setProjectEditorInstallTargets((current) => [
            ...current.filter((target) => target.projectPath !== projectPath),
            installTarget,
        ]);

        /** Repairs the registered project after its background editor download. */
        const installAndRepair = async (): Promise<void> => {
            try {
                const installResult = await installRelease(
                    release,
                    mono,
                    'project',
                );

                if (!installResult.success || !installResult.release) {
                    addAlert(
                        t('common:error'),
                        installResult.error || t('messages.addProjectError'),
                        <TriangleAlert />,
                    );
                    return;
                }

                const changeResult = await setProjectEditor(
                    addedProject,
                    installResult.release,
                );

                if (!changeResult.success) {
                    showAddProjectError(changeResult.error);
                }
            } catch (error) {
                showAddProjectError(
                    error instanceof Error ? error.message : undefined,
                );
            } finally {
                setProjectEditorInstallTargets((current) =>
                    current.filter(
                        (target) => target.projectPath !== projectPath,
                    ),
                );
            }
        };
        void installAndRepair();
        return true;
    };

    /**
     * Shows the available resolutions for a missing project editor.
     *
     * @param projectPath - Project file path being registered.
     * @param result - Registration result containing the editor requirement.
     * @param projectOptions - Registration choices to preserve on retry.
     * @returns Whether the chosen resolution adds the project.
     */
    const showEditorResolutionDialog = (
        projectPath: string,
        result: AddProjectToListResult,
        projectOptions: AddProjectOptions,
    ): Promise<boolean> => {
        const resolution = result.editorResolution;
        if (!resolution) {
            return Promise.resolve(false);
        }

        const downloadableRelease = findDownloadableProjectEditor(
            resolution,
            availableReleases,
            availablePrereleases,
        );
        const canDownload = Boolean(
            downloadableRelease &&
                (resolution.requested.flavor === 'gdscript' ||
                    resolution.requested.flavor === 'dotnet'),
        );
        const fallback = resolution.fallback;
        const editorActions =
            resolution.choices !== undefined
                ? resolution.choices.map((choice) => {
                      const name = choice.name?.trim();
                      const editorLabel =
                          choice.source === 'custom' &&
                          name &&
                          name !== choice.version
                              ? `${name} (${choice.version})`
                              : choice.version;
                      const version = `${editorLabel}${choice.recommended ? ` - ${t('welcome:onboarding.setup.recommended')}` : ''}`;
                      return {
                          label: choice.installed
                              ? t('addProject.editorResolution.useFallback', {
                                    version,
                                })
                              : t('addProject.editorResolution.download', {
                                    version,
                                }),
                          source: choice.source,
                          installed: choice.installed,
                          run: () =>
                              choice.installed
                                  ? retryAddProject(projectPath, {
                                        ...projectOptions,
                                        resolution: 'use_selected',
                                        editorChoiceId: choice.id,
                                    })
                                  : choice.release
                                    ? downloadEditorAndAddProject(
                                          projectPath,
                                          result,
                                          choice.release,
                                          choice.id,
                                          projectOptions,
                                      )
                                    : Promise.resolve(false),
                      };
                  })
                : [
                      ...(canDownload && downloadableRelease
                          ? [
                                {
                                    label: t(
                                        'addProject.editorResolution.download',
                                        {
                                            version:
                                                downloadableRelease.version,
                                        },
                                    ),
                                    source: 'official' as const,
                                    installed: false,
                                    run: () =>
                                        downloadEditorAndAddProject(
                                            projectPath,
                                            result,
                                            downloadableRelease,
                                            undefined,
                                            projectOptions,
                                        ),
                                },
                            ]
                          : []),
                      ...(fallback
                          ? [
                                {
                                    label: t(
                                        'addProject.editorResolution.useFallback',
                                        {
                                            version: fallback.version,
                                        },
                                    ),
                                    source:
                                        fallback.source ??
                                        ('official' as const),
                                    installed: true,
                                    run: () =>
                                        retryAddProject(projectPath, {
                                            ...projectOptions,
                                            resolution: 'use_fallback',
                                            release: fallback,
                                        }),
                                },
                            ]
                          : []),
                  ];

        return new Promise<boolean>((resolve) => {
            addCustomConfirm(
                t('addProject.editorResolution.title'),
                <ProjectEditorRecoveryDetails resolution={resolution} t={t} />,
                [
                    ...(editorActions.length > 0
                        ? [
                              {
                                  key: 'editor-actions',
                                  render: (close: () => void) => (
                                      <ProjectEditorRecoveryActions
                                          actions={editorActions}
                                          label={t(
                                              'addProject.editorResolution.editorActions',
                                          )}
                                          onSelect={(index) => {
                                              close();
                                              void editorActions[index]
                                                  .run()
                                                  .then(resolve);
                                          }}
                                      />
                                  ),
                              },
                          ]
                        : []),
                    {
                        typeClass: 'btn-ghost',
                        text: t('addProject.editorResolution.addMissing'),
                        onClick: async () => {
                            resolve(
                                await retryAddProject(projectPath, {
                                    ...projectOptions,
                                    resolution: 'add_missing',
                                }),
                            );
                            return true;
                        },
                    },
                    {
                        isCancel: true,
                        typeClass: 'btn-ghost',
                        text: t('common:buttons.cancel'),
                        onClick: () => {
                            resolve(false);
                            return true;
                        },
                    },
                ],
                undefined,
                'warning',
            );
        });
    };

    /**
     * Handles one registration result and any required editor resolution.
     *
     * @param projectPath - Project file path being registered.
     * @param result - Main-process registration result.
     * @param projectOptions - Registration choices to preserve on retry.
     * @returns Whether the project was added.
     */
    const handleAddProjectResult = async (
        projectPath: string,
        result: AddProjectToListResult,
        projectOptions: AddProjectOptions = {},
    ): Promise<boolean> => {
        if (result.importConflict) {
            const selected = await reviewLocalProjects(
                [projectPath],
                projectOptions.name === undefined
                    ? {}
                    : { [projectPath]: projectOptions.name },
            );
            if (!selected.length) return false;
            return retryAddProject(projectPath, {
                ...projectOptions,
                name: selected[0].name,
            });
        }
        if (result.editorResolution) {
            return showEditorResolutionDialog(
                projectPath,
                result,
                projectOptions,
            );
        }

        if (!result.success) {
            showAddProjectError(result.error);
            return false;
        }

        showRecoveredCodeEditorConfigWarning(
            result.recoveredCodeEditorConfigFiles,
        );
        return true;
    };

    /**
     * Reviews explicitly selected local files before any registration.
     * @param paths - Selected local project files.
     * @param chosenNames - Names retained after a stale registration conflict.
     * @param refreshedResult - Current requirement returned by a rejected registration.
     * @param previousEditorId - Preserve a prior editor action when still eligible.
     */
    const reviewLocalProjects = async (
        paths: string[],
        chosenNames: Record<string, string> = {},
        refreshedResult?: AddProjectToListResult,
        previousEditorId?: string,
    ): Promise<LocalImportRow[]> => {
        const inspected = await projectsBridge.inspectProjectImports(paths);
        const rows = inspected.map((row) =>
            prepareLocalImportRow(
                {
                    ...row,
                    ...(refreshedResult?.editorResolution
                        ? {
                              editorResolution:
                                  refreshedResult.editorResolution,
                              editorRequest:
                                  refreshedResult.editorResolution.requested,
                          }
                        : {}),
                    name: chosenNames[row.projectFilePath] ?? row.name,
                },
                availableReleases,
                availablePrereleases,
            ),
        );
        for (const row of rows) {
            if (
                previousEditorId &&
                row.editorActions.some(
                    (action) => action.id === previousEditorId,
                )
            )
                row.editorActionId = previousEditorId;
        }
        const existing = await projectsBridge.getProjectsDetails();
        const platform = await appBridge.getPlatform();
        if (
            !getImportConflicts(rows, existing, platform).some(Boolean) &&
            !rows.some((row) => row.editorResolution) &&
            !refreshedResult
        )
            return rows;
        return new Promise((resolve) =>
            setLocalReview({ rows, existing, platform, resolve }),
        );
    };

    /** Registers one reviewed item, reopening the combined review if its choices became stale.
     * @param row - Confirmed name and editor action.
     */
    const registerLocalRow = async (row: LocalImportRow): Promise<boolean> => {
        const action = row.editorActions.find(
            (candidate) => candidate.id === row.editorActionId,
        );
        if (!action) return false;
        const options = { ...action.options, name: row.name };
        /** Rechecks the affected item while retaining still-valid choices. */
        const reviewChanged = async (
            result: AddProjectToListResult,
        ): Promise<boolean> => {
            const selected = await reviewLocalProjects(
                [row.projectFilePath],
                { [row.projectFilePath]: row.name },
                result,
                row.editorActionId,
            );
            return selected.length ? registerLocalRow(selected[0]) : false;
        };
        if (action.download && row.editorResolution) {
            return downloadEditorAndAddProject(
                row.projectFilePath,
                { success: false, editorResolution: row.editorResolution },
                action.download,
                'editorChoiceId' in action.options
                    ? action.options.editorChoiceId
                    : undefined,
                options,
                reviewChanged,
            );
        }
        const result = await addProject(row.projectFilePath, options);
        if (result.importConflict || result.editorResolution) {
            return reviewChanged(result);
        }
        return handleAddProjectResult(row.projectFilePath, result, options);
    };

    /**
     * Reviews and registers a batch while preserving its chosen names on retry.
     * @param paths - Explicitly selected project files.
     * @param onProgress - Reports processed items after the review selection.
     */
    const importLocalProjects = async (
        paths: string[],
        onProgress?: (current: number, total: number) => void,
    ) => {
        try {
            const selected = await reviewLocalProjects(paths);
            onProgress?.(0, selected.length);
            for (const [index, row] of selected.entries()) {
                try {
                    await registerLocalRow(row);
                } catch (error) {
                    showAddProjectError(
                        error instanceof Error ? error.message : undefined,
                    );
                } finally {
                    onProgress?.(index + 1, selected.length);
                }
            }
        } catch (error) {
            showAddProjectError(
                error instanceof Error ? error.message : undefined,
            );
        }
    };

    /** Opens the file picker and reviews the selected project before registration. */
    const onAddProject = async () => {
        if (addingProject) return;
        setAddingProject(true);
        try {
            const result = await appBridge.openFileDialog(
                projectsLocation ?? '',
                t('addProject.selectFile'),
                [{ name: t('addProject.godotProject'), extensions: ['godot'] }],
            );
            if (!result.canceled)
                await importLocalProjects([result.filePaths[0]]);
        } finally {
            setAddingProject(false);
        }
    };

    return {
        localImportDialog: localReview ? (
            <ProjectImportReview
                rows={localReview.rows}
                existing={localReview.existing}
                platform={localReview.platform}
                t={t}
                onConfirm={(selected) => {
                    setLocalReview(null);
                    localReview.resolve(selected);
                }}
                onCancel={() => {
                    setLocalReview(null);
                    localReview.resolve([]);
                }}
            />
        ) : null,
        handleAddProjectResult,
        importLocalProjects,
        onAddProject,
        projectEditorInstallTargets,
    };
}
