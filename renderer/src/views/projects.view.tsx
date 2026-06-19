import type {
    AddProjectOptions,
    AddProjectToListResult,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
} from '@shared';
import logger from 'electron-log';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import {
    ChevronDown,
    ChevronsUpDown,
    ChevronUp,
    CircleX,
    Copy,
    EllipsisVertical,
    Files,
    TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import gitIconColor from '../assets/icons/git_icon_color.svg';
import vscodeIcon from '../assets/icons/vscode.svg';
import { InstalledReleaseSelector } from '../components/selectInstalledRelease.component';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useRelease } from '../hooks/useRelease';
import { CreateProjectSubView } from './subViews/createProject.subview';

TimeAgo.addLocale(en);
const timeAgo = new TimeAgo('en-US');

function getInvalidProjectTableKey(project: ProjectDetails): string {
    switch (project.invalid_reason) {
        case 'missing_project_file':
            return 'table.invalidReasons.missingProjectFile';
        case 'missing_editor':
            return 'table.invalidReasons.missingEditor';
        default:
            return 'table.invalidProject';
    }
}

function getInvalidProjectMessageKey(project: ProjectDetails): string {
    switch (project.invalid_reason) {
        case 'missing_project_file':
            return 'messages.invalidReasons.missingProjectFile';
        case 'missing_editor':
            return 'messages.invalidReasons.missingEditor';
        default:
            return 'messages.projectNotValid';
    }
}

type ProjectsViewProps = {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
};

export const ProjectsView: React.FC<ProjectsViewProps> = ({
    createOpen: controlledCreateOpen,
    onCreateOpenChange,
}) => {
    const { t } = useTranslation(['projects', 'common']);
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

    const [busyProjects, setBusyProjects] = useState<string[]>([]);

    // Initialize sortData from localStorage or use default
    const [sortData, setSortData] = useState<{
        field: string;
        order: 'asc' | 'desc';
    }>(() => {
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

    const { preferences } = usePreferences();
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
        addProject,
        launchProject,
        loading,
        showProjectMenu,
    } = useProjects();
    const { setCurrentView } = useAppNavigation();

    const onProjectMoreOptions = (
        e: React.MouseEvent,
        project: ProjectDetails,
    ) => {
        e.stopPropagation();
        showProjectMenu(project);
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

    const getFilteredRows = () => {
        const sortFunction = (a: ProjectDetails, b: ProjectDetails) => {
            if (sortData.field === 'name') {
                if (sortData.order === 'asc') {
                    return a.name.localeCompare(b.name);
                } else {
                    return b.name.localeCompare(a.name);
                }
            } else if (sortData.field === 'modified') {
                if (sortData.order === 'asc') {
                    return (
                        (a.last_opened?.getTime() || 0) -
                        (b.last_opened?.getTime() || 0)
                    );
                } else {
                    return (
                        (b.last_opened?.getTime() || 0) -
                        (a.last_opened?.getTime() || 0)
                    );
                }
            }
            return 0;
        };

        if (textSearch === '') return projects.sort(sortFunction);
        return projects
            .filter((row) =>
                row.name.toLowerCase().includes(textSearch.toLowerCase()),
            )
            .sort(sortFunction);
    };

    const getSortIcon = (field: string) => {
        if (sortData.field !== field) return null;
        else if (sortData.order === 'asc') {
            return <ChevronUp className="w-4 h-4 ml-2 cursor-pointer" />;
        } else {
            return <ChevronDown className="w-4 h-4 ml-2 cursor-pointer" />;
        }
    };

    const renderProjectEditorLabel = (row: ProjectDetails) => {
        if (isProjectEditorDownloading(row)) {
            return (
                <div className="flex flex-row items-center gap-2">
                    <span className="loading loading-spinner loading-xs"></span>
                    <p>
                        {row.version} {row.release.mono && '(.NET)'}
                    </p>
                </div>
            );
        }

        if (!isInstalledRelease(row.release.version, row.release.mono)) {
            return (
                <div className="flex flex-row items-center gap-2">
                    <TriangleAlert size={16} className="stroke-warning" />
                    <p className="line-through">
                        {row.version} {row.release.mono && '(.NET)'}
                    </p>
                </div>
            );
        }

        return (
            <>
                {row.version} {row.release.mono && '(.NET)'}
            </>
        );
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
                {isDraggingOver && (
                    <div className="absolute inset-0 z-30 bg-primary/20 border-4 border-dashed border-primary flex items-center justify-center pointer-events-none">
                        <div className="bg-base-100 p-8 rounded-lg shadow-xl max-w-lg text-center flex flex-col gap-3">
                            <Files className="w-10 h-10 mx-auto text-primary" />
                            <p className="text-2xl font-bold text-primary">
                                {t('messages.dropProjectFilesHere')}
                            </p>
                            <p className="text-sm text-base-content/70">
                                {t('messages.dropProjectFilesHelpPrefix')}{' '}
                                <code className="font-mono bg-base-300 px-2 rounded text-warning">
                                    project.godot
                                </code>{' '}
                                {t('messages.dropProjectFilesHelpSuffix')}
                            </p>
                        </div>
                    </div>
                )}
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between items-start">
                        <div className="flex flex-col gap-1">
                            <h1
                                data-testid="projectsTitle"
                                className="text-2xl"
                            >
                                {t('title')}
                            </h1>
                            <p className="badge text-base-content/50">
                                {preferences?.projects_location}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                data-testid="btnProjectAdd"
                                onClick={() => onAddProject()}
                                className="btn btn-neutral"
                            >
                                {t('buttons.add')}
                            </button>
                            <button
                                type="button"
                                disabled={installedReleases.length < 1}
                                data-testid="btnProjectCreate"
                                className="btn btn-primary"
                                onClick={() => setCreateOpen(true)}
                            >
                                {t('buttons.newProject')}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-row justify-end my-2 items-center">
                        <input
                            type="text"
                            placeholder={t('search.placeholder')}
                            className="input input-bordered w-full max-w-xs"
                            onChange={(e) => setTextSearch(e.target.value)}
                            value={textSearch}
                        />
                        {textSearch.length > 0 && (
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setTextSearch('')}
                                className="absolute right-4 w-6 h-6"
                            >
                                <CircleX />
                            </button>
                        )}
                    </div>
                </div>

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
                {loading && (
                    <div className="loading loading-dots loading-lg"></div>
                )}
                {!loading && (
                    <div className="overflow-auto h-full">
                        <table className="table table-md table-pin-rows">
                            <thead className="bg-base-200 text-xs">
                                <tr>
                                    <th className="min-w-48 w-full">
                                        <button
                                            type="button"
                                            className="flex items-center gap-2 cursor-pointer"
                                            onClick={() => {
                                                if (sortData.field === 'name') {
                                                    setSortData({
                                                        field: 'name',
                                                        order:
                                                            sortData.order ===
                                                            'asc'
                                                                ? 'desc'
                                                                : 'asc',
                                                    });
                                                } else {
                                                    setSortData({
                                                        field: 'name',
                                                        order: 'asc',
                                                    });
                                                }
                                            }}
                                        >
                                            {t('table.name')}
                                            {getSortIcon('name')}
                                        </button>
                                    </th>
                                    <th className="w-44 min-w-44">
                                        <button
                                            type="button"
                                            className="flex items-center gap-2 cursor-pointer"
                                            onClick={() => {
                                                if (
                                                    sortData.field ===
                                                    'modified'
                                                ) {
                                                    setSortData({
                                                        field: 'modified',
                                                        order:
                                                            sortData.order ===
                                                            'asc'
                                                                ? 'desc'
                                                                : 'asc',
                                                    });
                                                } else {
                                                    setSortData({
                                                        field: 'modified',
                                                        order: 'asc',
                                                    });
                                                }
                                            }}
                                        >
                                            {t('table.modified')}
                                            {getSortIcon('modified')}
                                        </button>
                                    </th>
                                    <th className="w-60 min-w-60">
                                        {t('table.editor')}
                                    </th>
                                    <th className=""></th>
                                </tr>
                            </thead>
                            <tbody className="overflow-y-auto">
                                {getFilteredRows().map((row) => {
                                    const editorDownloading =
                                        isProjectEditorDownloading(row);

                                    return (
                                        <tr
                                            key={`projectRow_${row.path}`}
                                            className="relative hover:bg-base-content/5"
                                        >
                                            <td className="p-2 flex flex-col gap-1">
                                                {busyProjects.includes(
                                                    row.path,
                                                ) && (
                                                    <div className="absolute bg-black/50 inset-0 z-10 flex items-center justify-center rounded-lg ">
                                                        <div className="loading loading-bars"></div>
                                                    </div>
                                                )}
                                                <div className="font-bold flex text-lg gap-2 items-center justify-start">
                                                    {!row.valid && (
                                                        <span
                                                            className="tooltip tooltip-right"
                                                            data-tip={t(
                                                                getInvalidProjectTableKey(
                                                                    row,
                                                                ),
                                                            )}
                                                        >
                                                            <TriangleAlert className="stroke-warning" />
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onLaunchProject(row)
                                                        }
                                                        className="flex items-center hover:underline gap-2"
                                                    >
                                                        {' '}
                                                        {row.name}
                                                    </button>
                                                    {row.withVSCode && (
                                                        <p
                                                            className="tooltip tooltip-right tooltip-primary flex items-center"
                                                            data-tip={t(
                                                                'table.vsCodeProject',
                                                            )}
                                                        >
                                                            <span className="text-xs text-base-content/50 ">
                                                                <img
                                                                    src={
                                                                        vscodeIcon
                                                                    }
                                                                    className="w-4 h-4"
                                                                    alt="VSCode"
                                                                />
                                                            </span>
                                                        </p>
                                                    )}
                                                    {row.withGit && (
                                                        <p
                                                            className="tooltip tooltip-right tooltip-primary flex items-center"
                                                            data-tip={t(
                                                                'table.gitProject',
                                                            )}
                                                        >
                                                            <span className="text-xs text-base-content/50 ">
                                                                <img
                                                                    src={
                                                                        gitIconColor
                                                                    }
                                                                    className="w-4 h-4 "
                                                                    alt="Git"
                                                                />
                                                            </span>
                                                        </p>
                                                    )}
                                                    {row.release.mono && (
                                                        <p
                                                            className="tooltip tooltip-right tooltip-primary flex items-center"
                                                            data-tip={t(
                                                                'table.dotNetProject',
                                                            )}
                                                        >
                                                            <span className="badge badge-outline text-xs text-base-content/50 ">
                                                                c#
                                                            </span>
                                                        </p>
                                                    )}
                                                    {row.release.prerelease && (
                                                        <p
                                                            className="tooltip tooltip-right right-0 tooltip-secondary flex items-center"
                                                            data-tip={t(
                                                                'table.prerelease',
                                                            )}
                                                        >
                                                            <span className="badge badge-secondary badge-outline text-xs text-base-content/50 ">
                                                                pr
                                                            </span>
                                                        </p>
                                                    )}
                                                    {row.open_windowed && (
                                                        <p
                                                            className="tooltip tooltip-right tooltip-primary flex items-center"
                                                            data-tip={t(
                                                                'table.windowedMode',
                                                            )}
                                                        >
                                                            <span className="badge badge-outline text-xs text-base-content/50">
                                                                w
                                                            </span>
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.navigator.clipboard.writeText(
                                                            row.path,
                                                        );
                                                    }}
                                                    className="py-0 text-xs flex rounded-full bg-base-100 px-2 text-base-content/50 items-center active:text-secondary"
                                                >
                                                    <p className="flex-1 w-0 overflow-hidden whitespace-nowrap text-ellipsis text-left">
                                                        {row.path}
                                                    </p>
                                                    <Copy className="stroke-base-content/50 w-4 hover:stroke-info active:stroke-secondary" />
                                                </button>
                                            </td>

                                            <td className="">
                                                <p>
                                                    {row.last_opened
                                                        ? timeAgo.format(
                                                              row.last_opened,
                                                          )
                                                        : '-'}
                                                </p>
                                            </td>
                                            <td className="">
                                                <div>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            editorDownloading
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setChangeEditorFor(
                                                                row,
                                                            );
                                                        }}
                                                        className="btn btn-ghost bg-base-content/5 pr-2 w-full justify-between"
                                                    >
                                                        {renderProjectEditorLabel(
                                                            row,
                                                        )}
                                                        <ChevronsUpDown />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-0 pr-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) =>
                                                        onProjectMoreOptions(
                                                            e,
                                                            row,
                                                        )
                                                    }
                                                    className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                                >
                                                    <EllipsisVertical />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
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
