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
import { ChevronDown, TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { appBridge } from '../../../bridge.ts';
import type { ConfirmButton } from '../../../components/confirm.component';
import { findDownloadableProjectEditor } from '../project-editor-resolution.model.ts';

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
    const [projectEditorInstallTargets, setProjectEditorInstallTargets] =
        useState<ProjectEditorInstallTarget[]>([]);
    const getRequestedMono = (result: AddProjectToListResult): boolean =>
        result.editorResolution?.requested.flavor === 'dotnet';

    const showAddProjectError = (error?: string) => {
        logger.error(error);
        addAlert(
            t('common:error'),
            error || t('messages.addProjectError'),
            <TriangleAlert className="stroke-error" />,
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
     * Adds the project as missing, installs its editor, and repairs the project.
     *
     * @param projectPath - Project file path being registered.
     * @param result - Initial result containing the editor requirement.
     * @param release - Editor release selected for installation.
     * @param projectOptions - Registration choices to preserve while adding.
     * @returns Whether the project was added before installation and repair.
     */
    const downloadEditorAndAddProject = async (
        projectPath: string,
        result: AddProjectToListResult,
        release: ReleaseSummary,
        projectOptions: AddProjectOptions,
    ): Promise<boolean> => {
        const mono = getRequestedMono(result);
        const addMissingResult = await addProject(projectPath, {
            ...projectOptions,
            resolution: 'add_missing',
        });

        if (!addMissingResult.success || !addMissingResult.newProject) {
            showAddProjectError(addMissingResult.error);
            return false;
        }

        const installTarget = {
            projectPath,
            version: release.version,
            mono,
        };
        setProjectEditorInstallTargets((current) => [
            ...current.filter((target) => target.projectPath !== projectPath),
            installTarget,
        ]);

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
                    <TriangleAlert className="stroke-error" />,
                );
                return true;
            }

            const changeResult = await setProjectEditor(
                addMissingResult.newProject,
                installResult.release,
            );

            if (!changeResult.success) {
                showAddProjectError(changeResult.error);
            }
            return true;
        } finally {
            setProjectEditorInstallTargets((current) =>
                current.filter((target) => target.projectPath !== projectPath),
            );
        }
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
        const editorActions = [
            ...(canDownload && downloadableRelease
                ? [
                      {
                          label: t('addProject.editorResolution.download', {
                              version: downloadableRelease.version,
                          }),
                          run: () =>
                              downloadEditorAndAddProject(
                                  projectPath,
                                  result,
                                  downloadableRelease,
                                  projectOptions,
                              ),
                      },
                  ]
                : []),
            ...(fallback
                ? [
                      {
                          label: t('addProject.editorResolution.useFallback', {
                              version: fallback.version,
                          }),
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
                <div className="flex flex-col gap-3">
                    <p>{t('addProject.editorResolution.message')}</p>
                    <div className="bg-base-200 rounded-md p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                        {resolution.requested.kind === 'exact' && (
                            <>
                                <span className="text-base-content/60">
                                    {t('addProject.editorResolution.version')}
                                </span>
                                <code>{resolution.requested.version}</code>
                            </>
                        )}
                        <span className="text-base-content/60">
                            {t('addProject.editorResolution.channel')}
                        </span>
                        <code>{resolution.requested.channel}</code>
                        <span className="text-base-content/60">
                            {t('addProject.editorResolution.flavor')}
                        </span>
                        <code>{resolution.requested.flavor}</code>
                        <span className="text-base-content/60">
                            {t('addProject.editorResolution.baseVersion')}
                        </span>
                        <code>{resolution.requested.base_version}</code>
                    </div>
                    {resolution.fallback && (
                        <div className="text-sm text-base-content/70">
                            <p>
                                {t(
                                    'addProject.editorResolution.fallbackMessage',
                                )}
                            </p>
                            <code className="block mt-1">
                                {resolution.fallback.name ??
                                    resolution.fallback.version}
                            </code>
                        </div>
                    )}
                </div>,
                [
                    ...(editorActions.length > 0
                        ? [
                              {
                                  key: 'editor-actions',
                                  render: (close: () => void) => (
                                      <div className="dropdown dropdown-top dropdown-start">
                                          <button
                                              type="button"
                                              tabIndex={0}
                                              className="btn btn-primary gap-1"
                                          >
                                              {t(
                                                  'addProject.editorResolution.editorActions',
                                              )}
                                              <ChevronDown
                                                  size={14}
                                                  aria-hidden="true"
                                              />
                                          </button>
                                          <ul className="dropdown-content menu bg-base-300 rounded-box z-1 min-w-60 p-1 shadow-sm border border-base-100">
                                              {editorActions.map((action) => (
                                                  <li key={action.label}>
                                                      <button
                                                          type="button"
                                                          onClick={() => {
                                                              close();
                                                              void action
                                                                  .run()
                                                                  .then(
                                                                      resolve,
                                                                  );
                                                          }}
                                                      >
                                                          {action.label}
                                                      </button>
                                                  </li>
                                              ))}
                                          </ul>
                                      </div>
                                  ),
                              },
                          ]
                        : []),
                    {
                        typeClass: 'btn-warning',
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
                        typeClass: 'btn-neutral',
                        text: t('common:buttons.cancel'),
                        onClick: () => {
                            resolve(false);
                            return true;
                        },
                    },
                ],
                <TriangleAlert className="stroke-warning" />,
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

    const onAddProject = async () => {
        if (addingProject) return;
        setAddingProject(true);
        const result = await appBridge.openFileDialog(
            projectsLocation ?? '',
            t('addProject.selectFile'),
            [{ name: t('addProject.godotProject'), extensions: ['godot'] }],
        );
        setAddingProject(false);

        if (!result.canceled) {
            const projectPath = result.filePaths[0];

            const addResult = await addProject(projectPath);
            logger.info(addResult);
            await handleAddProjectResult(projectPath, addResult);
        }
    };

    return {
        handleAddProjectResult,
        onAddProject,
        projectEditorInstallTargets,
    };
}
