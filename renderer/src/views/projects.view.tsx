import type { InstalledRelease, ProjectDetails } from '@shared';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { InstalledReleaseSelector } from '../components/selectInstalledRelease.component';
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
import { useAddProjectWorkflow } from './projects/hooks/useAddProjectWorkflow';
import { useProjectActions } from './projects/hooks/useProjectActions';
import { useProjectDropImport } from './projects/hooks/useProjectDropImport';
import { useProjectsSort } from './projects/hooks/useProjectsSort';
import {
    filterAndSortProjects,
    getInvalidProjectMessageKey,
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

    const [busyProjects, setBusyProjects] = useState<string[]>([]);

    const [sortData, setSortData] = useProjectsSort();

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
    const {
        projectActionsMenu,
        setProjectActionsMenu,
        onProjectMoreOptions,
        runProjectAction,
        showRecoveredVSCodeConfigWarning,
        handleToggleProjectWindowed,
        handleToggleProjectVSCode,
        handleInitializeProjectGit,
        handleImportEditorSettings,
        handleRemoveProject,
    } = useProjectActions({
        t,
        confirmProjectRemove: preferences?.confirm_project_remove,
        addAlert,
        addCustomConfirm,
        updatePreferences,
        setProjectWindowed,
        setProjectVSCode,
        initializeProjectGit,
        importProjectEditorSettings,
        removeProject,
    });
    const { handleAddProjectResult, onAddProject } = useAddProjectWorkflow({
        t,
        addingProject,
        projectsLocation: preferences?.projects_location,
        availableReleases,
        availablePrereleases,
        addAlert,
        addCustomConfirm,
        setAddingProject,
        addProject,
        installRelease,
        setProjectEditor,
        showRecoveredVSCodeConfigWarning,
    });
    const {
        isDraggingOver,
        loadingProgress,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    } = useProjectDropImport({
        t,
        addAlert,
        setAddingProject,
        addProject,
        handleAddProjectResult,
    });

    const isProjectEditorDownloading = (project: ProjectDetails): boolean =>
        downloadingReleases.some(
            (release) =>
                release.version === project.release.version &&
                release.mono === project.release.mono,
        );

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
