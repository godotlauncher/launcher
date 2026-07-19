import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    InstalledRelease,
    InstallReleaseResult,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import logger from 'electron-log';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import type React from 'react';
import { appBridge } from '../../../bridge.ts';
import type { ConfirmButton } from '../../../components/confirm.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
    ) => Promise<InstallReleaseResult>;
    setProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ChangeProjectEditorResult>;
    showRecoveredVSCodeConfigWarning: (recoveredFiles?: string[]) => void;
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
    showRecoveredVSCodeConfigWarning,
}: AddProjectWorkflowArgs) {
    const findDownloadableRelease = (
        result: AddProjectToListResult,
    ): ReleaseSummary | undefined => {
        const downloadable = result.editorResolution?.downloadable;
        if (!downloadable) {
            return undefined;
        }

        return [...availableReleases, ...availablePrereleases].find(
            (release) => release.version === downloadable.version,
        );
    };

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

    const retryAddProject = async (
        projectPath: string,
        options?: AddProjectOptions,
    ) => {
        const result = await addProject(projectPath, options);
        await handleAddProjectResult(projectPath, result);
    };

    const downloadEditorAndAddProject = async (
        projectPath: string,
        result: AddProjectToListResult,
        release: ReleaseSummary,
    ) => {
        const mono = getRequestedMono(result);
        const addMissingResult = await addProject(projectPath, {
            resolution: 'add_missing',
        });

        if (!addMissingResult.success || !addMissingResult.newProject) {
            showAddProjectError(addMissingResult.error);
            return;
        }

        const installResult = await installRelease(release, mono);

        if (!installResult.success || !installResult.release) {
            addAlert(
                t('common:error'),
                installResult.error || t('messages.addProjectError'),
                <TriangleAlert className="stroke-error" />,
            );
            return;
        }

        const changeResult = await setProjectEditor(
            addMissingResult.newProject,
            installResult.release,
        );

        if (!changeResult.success) {
            showAddProjectError(changeResult.error);
        }
    };

    const showEditorResolutionDialog = (
        projectPath: string,
        result: AddProjectToListResult,
    ): Promise<void> => {
        const resolution = result.editorResolution;
        if (!resolution) {
            return Promise.resolve();
        }

        const downloadableRelease = findDownloadableRelease(result);
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
                          run: () => {
                              void downloadEditorAndAddProject(
                                  projectPath,
                                  result,
                                  downloadableRelease,
                              );
                          },
                      },
                  ]
                : []),
            ...(fallback
                ? [
                      {
                          label: t('addProject.editorResolution.useFallback', {
                              version: fallback.version,
                          }),
                          run: () => {
                              void retryAddProject(projectPath, {
                                  resolution: 'use_fallback',
                                  release: fallback,
                              });
                          },
                      },
                  ]
                : []),
        ];

        return new Promise((resolve) => {
            addCustomConfirm(
                t('addProject.editorResolution.title'),
                <div className="flex flex-col gap-3">
                    <p>{t('addProject.editorResolution.message')}</p>
                    <div className="bg-base-200 rounded-md p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                        <span className="text-base-content/60">
                            {t('addProject.editorResolution.version')}
                        </span>
                        <code>{resolution.requested.version}</code>
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
                                                              resolve();
                                                              action.run();
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
                            await retryAddProject(projectPath, {
                                resolution: 'add_missing',
                            });
                            resolve();
                            return true;
                        },
                    },
                    {
                        isCancel: true,
                        typeClass: 'btn-neutral',
                        text: t('common:buttons.cancel'),
                        onClick: () => {
                            resolve();
                            return true;
                        },
                    },
                ],
                <TriangleAlert className="stroke-warning" />,
            );
        });
    };

    const handleAddProjectResult = async (
        projectPath: string,
        result: AddProjectToListResult,
    ): Promise<void> => {
        if (result.editorResolution) {
            await showEditorResolutionDialog(projectPath, result);
            return;
        }

        if (!result.success) {
            showAddProjectError(result.error);
            return;
        }

        showRecoveredVSCodeConfigWarning(result.recoveredVSCodeConfigFiles);
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
    };
}
