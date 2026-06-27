import type {
    AddProjectOptions,
    AddProjectToListResult,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
} from '@shared';
import logger from 'electron-log';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { InstalledReleaseSelector } from '../components/selectInstalledRelease.component';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/actionMenu.component';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useRelease } from '../hooks/useRelease';
import { ProjectActionsMenu } from './projects/components/projectActionsMenu.component';
import { ProjectsDropOverlay } from './projects/components/projectsDropOverlay.component';
import { ProjectsHeader } from './projects/components/projectsHeader.component';
import { ProjectsTable } from './projects/components/projectsTable.component';
import {
    filterAndSortProjects,
    getInvalidProjectMessageKey,
    type ProjectSortData,
} from './projects/projectsView.model';
import { CreateProjectSubView } from './subViews/createProject.subview';

type ProjectsViewProps = {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
};

export const ProjectsView: React.FC<ProjectsViewProps> = ({
    createOpen: controlledCreateOpen,
    onCreateOpenChange,
}) => {
    const { t } = useTranslation(['projects', 'common', 'menus', 'dialogs']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [localCreateOpen, setLocalCreateOpen] = useState<boolean>(false);
    const createOpen = controlledCreateOpen ?? localCreateOpen;
    const setCreateOpen = (open: boolean) => {
        if (onCreateOpenChange) {
            onCreateOpenChange(open);
            return;
        }

        setLocalCreateOpen(open);
    };

    const [changeEditorFor, setChangeEditorFor] =
        useState<ProjectDetails | null>();
    const [addingProject, setAddingProject] = useState<boolean>(false);
    const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
    const [loadingProgress, setLoadingProgress] = useState<{
        current: number;
        total: number;
    } | null>(null);
    const dragCounterRef = useRef<number>(0);
    const skipRemoveProjectConfirmRef = useRef<boolean>(false);

    const [busyProjects, setBusyProjects] = useState<string[]>([]);
    const [projectActionsMenu, setProjectActionsMenu] = useState<{
        project: ProjectDetails;
        anchorRect: ActionMenuAnchorRect;
        hasVSCode: boolean;
        hasGit: boolean;
    } | null>(null);

    // Initialize sortData from localStorage or use default
    const [sortData, setSortData] = useState<ProjectSortData>(() => {
        const saved = localStorage.getItem('projectsSortData');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return { field: 'modified', order: 'desc' };
            }
        }
        return { field: 'modified', order: 'desc' };
    });

    // Save sortData to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('projectsSortData', JSON.stringify(sortData));
    }, [sortData]);

    const { addAlert, addCustomConfirm } = useAlerts();

    const { preferences, updatePreferences } = usePreferences();
    const {
        installedReleases,
        availableReleases,
        availablePrereleases,
        downloadingReleases,
        installRelease,
        isInstalledRelease,
        loading: releaseLoading,
        checkAllReleasesValid,
    } = useRelease();
    const {
        projects,
        setProjectEditor,
        setProjectWindowed,
        setProjectVSCode,
        initializeProjectGit,
        exportProjectEditorSettings,
        importProjectEditorSettings,
        addProject,
        launchProject,
        openProjectFolder,
        openProjectEditorFolder,
        removeProject,
        loading,
    } = useProjects();
    const { setCurrentView } = useAppNavigation();

    const getProjectMenuToolAvailability = async (): Promise<{
        hasVSCode: boolean;
        hasGit: boolean;
    }> => {
        const tools = await window.electron.getCachedTools();
        return {
            hasVSCode: tools.some(
                (tool) => tool.name === 'VSCode' && tool.verified,
            ),
            hasGit: tools.some((tool) => tool.name === 'Git' && tool.verified),
        };
    };

    const onProjectMoreOptions = async (
        e: React.MouseEvent,
        project: ProjectDetails,
    ) => {
        e.stopPropagation();
        const anchorRect = getActionMenuAnchorRect(e.currentTarget);
        let toolAvailability = {
            hasVSCode: false,
            hasGit: false,
        };
        try {
            toolAvailability = await getProjectMenuToolAvailability();
        } catch (error) {
            showProjectActionError(error);
        }
        setProjectActionsMenu({
            project,
            anchorRect,
            ...toolAvailability,
        });
    };

    const showProjectActionError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        addAlert(
            t('common:error'),
            message,
            <TriangleAlert className="stroke-error" />,
        );
    };

    const runProjectAction = (action: () => Promise<void>) => {
        void action().catch(showProjectActionError);
    };

    const handleToggleProjectWindowed = (project: ProjectDetails) => {
        runProjectAction(async () => {
            await setProjectWindowed(project, !project.open_windowed);
        });
    };

    const handleToggleProjectVSCode = (project: ProjectDetails) => {
        runProjectAction(async () => {
            const updatedProject = await setProjectVSCode(
                project,
                !project.withVSCode,
            );
            showRecoveredVSCodeConfigWarning(
                updatedProject.recoveredVSCodeConfigFiles,
            );
        });
    };

    const handleInitializeProjectGit = (project: ProjectDetails) => {
        runProjectAction(async () => {
            await initializeProjectGit(project);
        });
    };

    const handleImportEditorSettings = (project: ProjectDetails) => {
        addCustomConfirm(
            t('dialogs:importSettings.title'),
            <div className="flex flex-col gap-2">
                <p>{t('dialogs:importSettings.message')}</p>
                <p>{t('dialogs:importSettings.detail')}</p>
            </div>,
            [
                {
                    typeClass: 'btn-warning',
                    text: t('dialogs:importSettings.continue'),
                    onClick: async () => {
                        try {
                            await importProjectEditorSettings(project);
                        } catch (error) {
                            showProjectActionError(error);
                        }
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('dialogs:importSettings.cancel'),
                    onClick: () => true,
                },
            ],
            <TriangleAlert className="stroke-warning" />,
        );
    };

    const handleRemoveProject = (project: ProjectDetails) => {
        const removeSelectedProject = async () => {
            await removeProject(project);
        };

        if (!preferences?.confirm_project_remove) {
            runProjectAction(removeSelectedProject);
            return;
        }

        skipRemoveProjectConfirmRef.current = false;
        addCustomConfirm(
            t('dialogs:removeProject.title'),
            <div className="flex flex-col gap-3">
                <p>
                    {t('dialogs:removeProject.message', {
                        projectName: project.name,
                    })}
                </p>
                <p>{t('dialogs:removeProject.detail')}</p>
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        onChange={(event) => {
                            skipRemoveProjectConfirmRef.current =
                                event.currentTarget.checked;
                        }}
                    />
                    <span>{t('dialogs:removeProject.doNotAskAgain')}</span>
                </label>
            </div>,
            [
                {
                    typeClass: 'btn-error',
                    text: t('dialogs:removeProject.ok'),
                    onClick: async () => {
                        if (skipRemoveProjectConfirmRef.current) {
                            updatePreferences({
                                confirm_project_remove: false,
                            });
                        }
                        try {
                            await removeSelectedProject();
                        } catch (error) {
                            showProjectActionError(error);
                        }
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('dialogs:removeProject.cancel'),
                    onClick: () => true,
                },
            ],
            <TriangleAlert className="stroke-warning" />,
        );
    };

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

    const showRecoveredVSCodeConfigWarning = (
        recoveredFiles?: string[],
    ): void => {
        if (!recoveredFiles || recoveredFiles.length === 0) {
            return;
        }

        addAlert(
            t('common:warning'),
            <div className="space-y-2">
                <p>{t('messages.recoveredVSCodeConfig')}</p>
                <ul className="list-disc pl-5">
                    {recoveredFiles.map((file) => (
                        <li key={file}>
                            <code>{file}</code>
                        </li>
                    ))}
                </ul>
            </div>,
            <TriangleAlert className="stroke-warning" />,
        );
    };

    const isProjectEditorDownloading = (project: ProjectDetails): boolean =>
        downloadingReleases.some(
            (release) =>
                release.version === project.release.version &&
                release.mono === project.release.mono,
        );

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

    const onAddProject = async () => {
        if (addingProject) return;
        setAddingProject(true);
        const result = await window.electron.openFileDialog(
            preferences?.projects_location ?? '',
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

    const onChangeProjectEditor = async (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => {
        setChangeEditorFor(null);
        setBusyProjects([...busyProjects, project.path]);

        try {
            const result = await setProjectEditor(project, release);
            if (!result.success) {
                addAlert(
                    t('common:error'),
                    result.error || t('messages.setEditorError'),
                );
                return;
            }
        } finally {
            setBusyProjects((prevValues) =>
                prevValues.filter((p) => p !== project.path),
            );
        }
    };

    const onLaunchProject = async (project: ProjectDetails) => {
        if (isInstalledRelease(project.release.version, project.release.mono)) {
            const result = await launchProject(project);
            if (!result?.valid) {
                await checkAllReleasesValid();
                addAlert(
                    t('common:error'),
                    t(getInvalidProjectMessageKey(result ?? project)),
                );
            }
        } else {
            await checkAllReleasesValid();
            addAlert(t('common:error'), t('messages.invalidReleaseEditor'));
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDraggingOver(false);
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingOver(false);

        // In Electron, we need to use getAsFile() which returns a File object
        // Then use webUtils.getPathForFile() to get the full path
        const items = Array.from(e.dataTransfer.items);
        const godotFiles: string[] = [];

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                // Match project.godot, project (1).godot, project (2).godot, etc.
                if (file && /^project(\s*\(\d+\))?\.godot$/i.test(file.name)) {
                    try {
                        // Use Electron's webUtils to get the full file path
                        const filePath = window.electron.getPathForFile(file);
                        if (filePath) {
                            godotFiles.push(filePath);
                        }
                    } catch (error) {
                        logger.error('Error getting file path:', error);
                    }
                }
            }
        }

        if (godotFiles.length === 0) {
            addAlert(
                t('common:error'),
                t('messages.dropGodotFileOnly'),
                <TriangleAlert className="stroke-error" />,
            );
            return;
        }

        setAddingProject(true);
        setLoadingProgress({ current: 0, total: godotFiles.length });

        try {
            logger.info(`Starting to add ${godotFiles.length} projects`);
            for (let i = 0; i < godotFiles.length; i++) {
                const projectPath = godotFiles[i];
                setLoadingProgress({
                    current: i + 1,
                    total: godotFiles.length,
                });
                logger.info(
                    `[${i + 1}/${godotFiles.length}] Adding project from:`,
                    projectPath,
                );
                try {
                    const addResult = await addProject(projectPath);
                    await handleAddProjectResult(projectPath, addResult);

                    if (addResult.success) {
                        logger.info(
                            `[${i + 1}/${godotFiles.length}] Successfully added project:`,
                            addResult.newProject?.name,
                        );
                    }
                } catch (error) {
                    logger.error(
                        `[${i + 1}/${godotFiles.length}] Exception while adding project:`,
                        error,
                    );
                    addAlert(
                        t('common:error'),
                        t('messages.failedAddProject', {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                        <TriangleAlert className="stroke-error" />,
                    );
                }
            }
            logger.info('Finished adding all projects');
        } finally {
            setAddingProject(false);
            setLoadingProgress(null);
        }
    };

    const filteredRows = filterAndSortProjects(projects, textSearch, sortData);

    return (
        <>
            {addingProject && (
                <WaitingForDialogOverlay
                    className="z-20"
                    message={
                        loadingProgress
                            ? t('messages.addingProjects', {
                                  current: loadingProgress.current,
                                  total: loadingProgress.total,
                              })
                            : t('messages.waitingForDialog')
                    }
                />
            )}

            {changeEditorFor && (
                <InstalledReleaseSelector
                    title={changeEditorFor.name}
                    currentRelease={changeEditorFor.release}
                    onReleaseSelected={(release) =>
                        onChangeProjectEditor(changeEditorFor, release)
                    }
                    onClose={() => setChangeEditorFor(null)}
                />
            )}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop requires event handlers on container */}
            <div
                className="flex flex-col h-full w-full overflow-auto p-1"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDraggingOver && <ProjectsDropOverlay t={t} />}
                <ProjectsHeader
                    title={t('title')}
                    projectsLocation={preferences?.projects_location}
                    searchPlaceholder={t('search.placeholder')}
                    searchValue={textSearch}
                    onSearchChange={setTextSearch}
                    onAddProject={() => void onAddProject()}
                    onCreateProject={() => setCreateOpen(true)}
                    createDisabled={installedReleases.length < 1}
                    addLabel={t('buttons.add')}
                    createLabel={t('buttons.newProject')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                />

                {!releaseLoading && installedReleases.length < 1 && (
                    <div className="text-warning flex gap-2">
                        <TriangleAlert className="stroke-warning" />
                        <Trans
                            ns="projects"
                            i18nKey="messages.noReleasesCta"
                            components={{
                                Link: (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCurrentView('installs')
                                        }
                                        className="underline cursor-pointer"
                                    />
                                ),
                            }}
                        />
                    </div>
                )}
                <div className="divider m-0"></div>
                <ProjectsTable
                    rows={filteredRows}
                    loading={loading}
                    busyProjects={busyProjects}
                    sortData={sortData}
                    onSortChange={setSortData}
                    isInstalledRelease={isInstalledRelease}
                    isProjectEditorDownloading={isProjectEditorDownloading}
                    onLaunchProject={(project) => void onLaunchProject(project)}
                    onChangeEditor={setChangeEditorFor}
                    onProjectMoreOptions={onProjectMoreOptions}
                    t={t}
                />
            </div>
            <ProjectActionsMenu
                project={projectActionsMenu?.project ?? null}
                anchorRect={projectActionsMenu?.anchorRect ?? null}
                hasVSCode={projectActionsMenu?.hasVSCode ?? false}
                hasGit={projectActionsMenu?.hasGit ?? false}
                t={t}
                onClose={() => setProjectActionsMenu(null)}
                onOpenProjectFolder={(project) =>
                    runProjectAction(() => openProjectFolder(project))
                }
                onOpenEditorSettingsFolder={(project) =>
                    runProjectAction(() => openProjectEditorFolder(project))
                }
                onToggleWindowed={handleToggleProjectWindowed}
                onToggleVSCode={handleToggleProjectVSCode}
                onInitializeGit={handleInitializeProjectGit}
                onExportEditorSettings={(project) =>
                    runProjectAction(() => exportProjectEditorSettings(project))
                }
                onImportEditorSettings={handleImportEditorSettings}
                onRemoveProject={handleRemoveProject}
            />
            {createOpen && (
                <CreateProjectSubView
                    onClose={() => {
                        setCreateOpen(false);
                    }}
                />
            )}
        </>
    );
};
