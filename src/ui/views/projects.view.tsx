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
    TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import gitIconColor from '../assets/icons/git_icon_color.svg';
import vscodeIcon from '../assets/icons/vscode.svg';
import { InstalledReleaseSelector } from '../components/selectInstalledRelease.component';
import { useAlerts } from '../hooks/useAlerts';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useRelease } from '../hooks/useRelease';
import { CreateProjectSubView } from './subViews/createProject.subview';

TimeAgo.addLocale(en);
const timeAgo = new TimeAgo('en-US');

export const ProjectsView: React.FC = () => {
    const { t } = useTranslation(['projects', 'common']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [createOpen, setCreateOpen] = useState<boolean>(false);

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

    const { addAlert } = useAlerts();

    const { preferences } = usePreferences();
    const {
        installedReleases,
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

            if (installedReleases.length === 0) {
                addAlert(
                    t('common:error'),
                    t('messages.needReleaseInstalled'),
                    <TriangleAlert className="stroke-error" />,
                );
                return;
            }

            const addResult = await addProject(projectPath);
            logger.info(addResult);
            if (!addResult.success) {
                logger.error(addResult.error);
                addAlert(
                    t('common:error'),
                    addResult.error || t('messages.addProjectError'),
                    <TriangleAlert className="stroke-error" />,
                );
                return;
            }
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
            if (!result) {
                await checkAllReleasesValid();
                addAlert(t('common:error'), t('messages.projectNotValid'));
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

        if (installedReleases.length === 0) {
            addAlert(
                t('common:error'),
                t('messages.needReleaseInstalled'),
                <TriangleAlert className="stroke-error" />,
            );
            return;
        }

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
                t('messages.dropGodotFileOnly') ||
                    'Please drop a project.godot file',
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

                    if (!addResult.success) {
                        logger.error(
                            `[${i + 1}/${godotFiles.length}] Failed:`,
                            addResult.error,
                        );
                        addAlert(
                            t('common:error'),
                            addResult.error || t('messages.addProjectError'),
                            <TriangleAlert className="stroke-error" />,
                        );
                    } else {
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
                        `Failed to add project: ${error instanceof Error ? error.message : String(error)}`,
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
                <div className="absolute inset-0 z-20 w-full h-full bg-black/80 flex flex-col items-center justify-center gap-4">
                    <p className="loading loading-infinity loading-lg"></p>
                    {loadingProgress ? (
                        <p className="text-white text-xl font-semibold">
                            {t('messages.addingProjects', {
                                current: loadingProgress.current,
                                total: loadingProgress.total,
                            })}
                        </p>
                    ) : (
                        <p className="text-white text-xl font-semibold">
                            {t('messages.waitingForDialog')}
                        </p>
                    )}
                </div>
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
                        <div className="bg-base-100 p-8 rounded-lg shadow-xl">
                            <p className="text-2xl font-bold text-primary">
                                {t('messages.dropProjectHere') ||
                                    'Drop project.godot file here'}
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
                                disabled={installedReleases.length < 1}
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
                                {getFilteredRows().map((row, index) => (
                                    <tr
                                        key={`projectRow_${row.path}_${index}`}
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
                                                            'table.invalidProject',
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
                                                                src={vscodeIcon}
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
                                                <p className="flex-1 w-0 overflow-hidden whitespace-nowrap text-ellipsis">
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
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setChangeEditorFor(row);
                                                    }}
                                                    className="btn btn-ghost bg-base-content/5 pr-2 w-full justify-between"
                                                >
                                                    {!isInstalledRelease(
                                                        row.release.version,
                                                        row.release.mono,
                                                    ) ? (
                                                        <div className="flex flex-row items-center gap-2">
                                                            <TriangleAlert
                                                                size={16}
                                                                className="stroke-warning"
                                                            />
                                                            <p className="line-through">
                                                                {row.version}{' '}
                                                                {row.release
                                                                    .mono &&
                                                                    '(.NET)'}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {row.version}{' '}
                                                            {row.release.mono &&
                                                                '(.NET)'}
                                                        </>
                                                    )}
                                                    <ChevronsUpDown />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-0 pr-2">
                                            <button
                                                type="button"
                                                onClick={(e) =>
                                                    onProjectMoreOptions(e, row)
                                                }
                                                className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                            >
                                                <EllipsisVertical />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
