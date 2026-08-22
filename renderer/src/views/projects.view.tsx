import type {
    CodeEditorId,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import { FolderPlus, HardDriveDownload, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/actionMenu.component';
import { EmptyState } from '../components/ui/empty-state.component.tsx';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { usePreferences } from '../hooks/usePreferences';
import { useProjects } from '../hooks/useProjects';
import { useRelease } from '../hooks/useRelease';
import { useToolIntegrations } from '../hooks/useToolIntegrations';
import { appRoutePaths } from '../routes.ts';
import { AddProjectSourceMenu } from './projects/components/add-project-source-menu.component';
import { ProjectActionsMenu } from './projects/components/projectActionsMenu.component';
import { ProjectFoldersMenu } from './projects/components/projectFoldersMenu.component';
import { ProjectsDropOverlay } from './projects/components/projectsDropOverlay.component';
import { ProjectsHeader } from './projects/components/projectsHeader.component';
import { ProjectsList } from './projects/components/projectsList.component';
import {
    RemoteProjectImportModal,
    type RemoteProjectSource,
} from './projects/components/remote-project-import.modal';
import { useAddProjectWorkflow } from './projects/hooks/useAddProjectWorkflow';
import { useProjectActions } from './projects/hooks/useProjectActions';
import { useProjectDropImport } from './projects/hooks/useProjectDropImport';
import {
    getInvalidProjectMessageKey,
    getProjectSections,
    getProjectsViewState,
} from './projects/projectsView.model';
import {
    type GitAvailability,
    getGitAvailability,
} from './projects/remote-project-import.model';
import { CreateProjectDrawer } from './subViews/createProjectDrawer.subview';
import { ProjectSettingsDrawer } from './subViews/projectSettingsDrawer.subview';

type ProjectsViewProps = {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
};

type ProjectFoldersMenuState = {
    project: ProjectDetails;
    anchorRect: ActionMenuAnchorRect;
};

/**
 * Renders projects and their project-management drawers.
 *
 * @param props - Optional controlled create-project drawer state.
 * @returns The projects view.
 */
export const ProjectsView: React.FC<ProjectsViewProps> = ({
    createOpen: controlledCreateOpen,
    onCreateOpenChange,
}) => {
    const { t, i18n } = useTranslation([
        'projects',
        'common',
        'menus',
        'dialogs',
    ]);
    const navigate = useNavigate();
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

    const [editProjectFor, setEditProjectFor] = useState<ProjectDetails | null>(
        null,
    );
    const [projectFoldersMenu, setProjectFoldersMenu] =
        useState<ProjectFoldersMenuState | null>(null);
    const [addingProject, setAddingProject] = useState<boolean>(false);
    const [addSourceMenuAnchor, setAddSourceMenuAnchor] =
        useState<ActionMenuAnchorRect | null>(null);
    const [remoteProjectSource, setRemoteProjectSource] =
        useState<RemoteProjectSource | null>(null);
    const [gitAvailability, setGitAvailability] =
        useState<GitAvailability>('loading');

    const [busyProjects, setBusyProjects] = useState<string[]>([]);
    const [highlightedPinnedProjectPath, setHighlightedPinnedProjectPath] =
        useState<string | null>(null);
    const clearPinnedHighlight = useCallback(
        () => setHighlightedPinnedProjectPath(null),
        [],
    );

    const { addAlert, addCustomConfirm } = useAlerts();

    const { preferences, updatePreferences } = usePreferences();
    const { listIntegrations: listToolIntegrations } = useToolIntegrations();
    const {
        installedReleases,
        availableReleases,
        availablePrereleases,
        downloadingReleases,
        installRelease,
        isInstalledRelease,
        loading: releasesLoading,
        initialized: releasesInitialized,
        checkAllReleasesValid,
    } = useRelease();
    const {
        projects,
        codeEditorSettings,
        setProjectEditor,
        setProjectWindowed,
        setProjectPinned,
        reorderPinnedProjects,
        setProjectCodeEditor,
        resetProjectCodeEditorConfig,
        initializeProjectGit,
        getProjectGitIdentity,
        setProjectGitIdentity,
        exportProjectEditorSettings,
        importProjectEditorSettings,
        addProject,
        launchProject,
        openProjectFolder,
        openProjectEditorFolder,
        renameProject,
        getProjectGodotName,
        removeProject,
        refreshProjects,
        loading,
    } = useProjects();
    const { setCurrentView } = useAppNavigation();
    const {
        projectActionsMenu,
        setProjectActionsMenu,
        onProjectMoreOptions,
        runProjectAction,
        showRecoveredCodeEditorConfigWarning,
        handleToggleProjectPinned,
        handleImportEditorSettings,
        handleRemoveProject,
        showProjectActionError,
    } = useProjectActions({
        t,
        confirmProjectRemove: preferences?.confirm_project_remove,
        addAlert,
        addCustomConfirm,
        updatePreferences,
        setProjectPinned,
        onProjectPinned: setHighlightedPinnedProjectPath,
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
        showRecoveredCodeEditorConfigWarning,
    });

    const refreshGitAvailability = useCallback(async () => {
        setGitAvailability('loading');
        try {
            const integrations = await listToolIntegrations();
            setGitAvailability(getGitAvailability(integrations));
        } catch {
            setGitAvailability('unavailable');
        }
    }, [listToolIntegrations]);

    useEffect(() => {
        void refreshGitAvailability();
    }, [refreshGitAvailability]);

    const openAddProjectSourceMenu: React.MouseEventHandler<
        HTMLButtonElement
    > = (event) => {
        setAddSourceMenuAnchor(getActionMenuAnchorRect(event.currentTarget));
        void refreshGitAvailability();
    };

    const openRemoteProjectSource = (source: RemoteProjectSource) => {
        setAddSourceMenuAnchor(null);
        setRemoteProjectSource(source);
    };
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

    const onSetProjectEditorFromSettings = async (
        project: ProjectDetails,
        release: InstalledRelease,
    ): Promise<ProjectDetails> => {
        setBusyProjects([...busyProjects, project.path]);

        try {
            const result = await setProjectEditor(project, release);
            if (!result.success) {
                throw new Error(result.error || t('messages.setEditorError'));
            }

            return (
                result.projects?.find(
                    (updatedProject) => updatedProject.path === project.path,
                ) ?? {
                    ...project,
                    release,
                    version: release.version,
                    version_number: release.version_number,
                }
            );
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

    const onSetProjectCodeEditor = async (
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ): Promise<ProjectDetails> => {
        const updatedProject = await setProjectCodeEditor(
            project,
            codeEditorId,
        );
        showRecoveredCodeEditorConfigWarning(
            updatedProject.recoveredCodeEditorConfigFiles,
        );
        return updatedProject;
    };

    const onResetProjectCodeEditorConfig = async (
        project: ProjectDetails,
    ): Promise<ProjectDetails> => {
        const updatedProject = await resetProjectCodeEditorConfig(project);
        showRecoveredCodeEditorConfigWarning(
            updatedProject.recoveredCodeEditorConfigFiles,
        );
        return updatedProject;
    };

    const projectSections = getProjectSections(projects, textSearch);
    const validInstalledReleaseCount = installedReleases.filter(
        (release) => release.valid !== false,
    ).length;
    const viewState = getProjectsViewState({
        projectCount: projects.length,
        installedReleaseCount: validInstalledReleaseCount,
        downloadingReleaseCount: downloadingReleases.length,
        textSearch,
        projectsLoading: loading,
        releasesLoading,
        releasesInitialized,
    });
    const showEmptyState =
        viewState === 'empty-without-editor' ||
        viewState === 'empty-installing-editor' ||
        viewState === 'empty-with-editor';

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
                    onAddProject={openAddProjectSourceMenu}
                    onCreateProject={() => setCreateOpen(true)}
                    createDisabled={validInstalledReleaseCount < 1}
                    addLabel={t('buttons.add')}
                    createLabel={t('buttons.newProject')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                    showControls={!showEmptyState}
                />

                {viewState === 'list' &&
                    projects.length > 0 &&
                    validInstalledReleaseCount < 1 && (
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
                                            className="underline"
                                        />
                                    ),
                                }}
                            />
                        </div>
                    )}
                {viewState === 'empty-without-editor' && (
                    <EmptyState
                        icon={HardDriveDownload}
                        heading={t('emptyState.withoutEditor.heading')}
                        description={t('emptyState.withoutEditor.description')}
                        primaryActionLabel={t(
                            'emptyState.withoutEditor.installEditor',
                        )}
                        secondaryActionLabel={t(
                            'emptyState.addExistingProject',
                        )}
                        onPrimaryAction={() =>
                            navigate(appRoutePaths.installEditor)
                        }
                        onSecondaryAction={openAddProjectSourceMenu}
                    />
                )}
                {viewState === 'empty-with-editor' && (
                    <EmptyState
                        icon={FolderPlus}
                        heading={t('emptyState.withEditor.heading')}
                        description={t('emptyState.withEditor.description')}
                        primaryActionLabel={t(
                            'emptyState.withEditor.newProject',
                        )}
                        secondaryActionLabel={t(
                            'emptyState.addExistingProject',
                        )}
                        onPrimaryAction={() => setCreateOpen(true)}
                        onSecondaryAction={openAddProjectSourceMenu}
                    />
                )}
                {viewState === 'empty-installing-editor' && (
                    <EmptyState
                        icon={HardDriveDownload}
                        heading={t('emptyState.withoutEditor.heading')}
                        description={t(
                            'emptyState.withoutEditor.installingDescription',
                        )}
                        primaryActionLabel={t(
                            'emptyState.withoutEditor.installingEditor',
                        )}
                        primaryActionPending
                        secondaryActionLabel={t(
                            'emptyState.addExistingProject',
                        )}
                        onSecondaryAction={openAddProjectSourceMenu}
                    />
                )}
                {!showEmptyState && (
                    <>
                        <div className="divider m-0"></div>
                        <ProjectsList
                            sections={projectSections}
                            loading={loading}
                            locale={
                                i18n.resolvedLanguage ?? i18n.language ?? 'en'
                            }
                            busyProjects={busyProjects}
                            codeEditorSettings={codeEditorSettings}
                            highlightedPinnedProjectPath={
                                highlightedPinnedProjectPath
                            }
                            pinnedReorderingDisabled={
                                textSearch.trim().length > 0
                            }
                            onPinnedHighlightComplete={clearPinnedHighlight}
                            onReorderPinnedProjects={async (
                                orderedProjectPaths,
                            ) => {
                                try {
                                    await reorderPinnedProjects(
                                        orderedProjectPaths,
                                    );
                                } catch (error) {
                                    showProjectActionError(error);
                                    await refreshProjects();
                                }
                            }}
                            isInstalledRelease={isInstalledRelease}
                            isProjectEditorDownloading={
                                isProjectEditorDownloading
                            }
                            onLaunchProject={(project) =>
                                void onLaunchProject(project)
                            }
                            onProjectFoldersOptions={(event, project) => {
                                event.stopPropagation();
                                setProjectActionsMenu(null);
                                setProjectFoldersMenu({
                                    project,
                                    anchorRect: getActionMenuAnchorRect(
                                        event.currentTarget,
                                    ),
                                });
                            }}
                            onTogglePinned={handleToggleProjectPinned}
                            onProjectSettings={setEditProjectFor}
                            onProjectMoreOptions={(event, project) => {
                                setProjectFoldersMenu(null);
                                void onProjectMoreOptions(event, project);
                            }}
                            t={t}
                        />
                    </>
                )}
            </div>
            <ProjectFoldersMenu
                project={projectFoldersMenu?.project ?? null}
                anchorRect={projectFoldersMenu?.anchorRect ?? null}
                t={t}
                onClose={() => setProjectFoldersMenu(null)}
                onOpenProjectFolder={(project) =>
                    runProjectAction(() => openProjectFolder(project))
                }
                onOpenEditorSettingsFolder={(project) =>
                    runProjectAction(() => openProjectEditorFolder(project))
                }
            />
            <AddProjectSourceMenu
                anchorRect={addSourceMenuAnchor}
                gitAvailability={gitAvailability}
                t={t}
                onClose={() => setAddSourceMenuAnchor(null)}
                onFromComputer={() => void onAddProject()}
                onPublicGit={() => openRemoteProjectSource('public-git-url')}
                onGitHub={() => openRemoteProjectSource('github')}
            />
            <ProjectActionsMenu
                project={projectActionsMenu?.project ?? null}
                anchorRect={projectActionsMenu?.anchorRect ?? null}
                t={t}
                onClose={() => setProjectActionsMenu(null)}
                onExportEditorSettings={(project) =>
                    runProjectAction(() => exportProjectEditorSettings(project))
                }
                onImportEditorSettings={handleImportEditorSettings}
                onRemoveProject={handleRemoveProject}
            />
            <ProjectSettingsDrawer
                project={editProjectFor}
                open={Boolean(editProjectFor)}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditProjectFor(null);
                    }
                }}
                onRenameProject={renameProject}
                installedReleases={installedReleases}
                onSetProjectEditor={onSetProjectEditorFromSettings}
                onSetProjectCodeEditor={onSetProjectCodeEditor}
                onSetProjectWindowed={setProjectWindowed}
                onInitializeProjectGit={initializeProjectGit}
                getProjectGitIdentity={getProjectGitIdentity}
                onSetProjectGitIdentity={setProjectGitIdentity}
                onResetProjectCodeEditorConfig={onResetProjectCodeEditorConfig}
                getProjectGodotName={getProjectGodotName}
            />
            <CreateProjectDrawer
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
            <RemoteProjectImportModal
                source={remoteProjectSource}
                onOpenChange={(open) => {
                    if (!open) {
                        setRemoteProjectSource(null);
                    }
                }}
                handleAddProjectResult={handleAddProjectResult}
            />
        </>
    );
};
