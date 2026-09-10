import type {
    CodeEditorId,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appRoutePaths } from '../app.routes';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/action-menu.component';
import { ContentDivider } from '../components/ui/content-divider.component';
import { WaitingForDialogOverlay } from '../components/waiting-for-dialog-overlay.component';
import { useAlerts } from '../hooks/alerts.hook';
import { useAppNavigation } from '../hooks/app-navigation.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useProjects } from '../hooks/projects.hook';
import { useRelease } from '../hooks/release.hook';
import { useToolIntegrations } from '../hooks/tool-integrations.hook';
import { terminalBridge } from '../renderer.bridge';
import { AddProjectSourceMenu } from './projects/components/add-project-source-menu.component';
import { ProjectActionsMenu } from './projects/components/project-actions-menu.component';
import { ProjectFoldersMenu } from './projects/components/project-folders-menu.component';
import { ProjectsDropOverlay } from './projects/components/projects-drop-overlay.component';
import { ProjectsHeader } from './projects/components/projects-header.component';
import { ProjectsList } from './projects/components/projects-list.component';
import { ProjectsWelcome } from './projects/components/projects-welcome.component';
import {
    RemoteProjectImportModal,
    type RemoteProjectSource,
} from './projects/components/remote-project-import.modal';
import { useAddProjectWorkflow } from './projects/hooks/add-project-workflow.hook';
import { useProjectActions } from './projects/hooks/project-actions.hook';
import { useProjectDropImport } from './projects/hooks/project-drop-import.hook';
import { findDownloadableMissingProjectEditor } from './projects/project-editor-resolution.model';
import type { ProjectViewMode } from './projects/project-view.types';
import {
    getInvalidProjectMessageKey,
    getProjectSections,
    getProjectsViewState,
} from './projects/projects-view.model';
import {
    type GitAvailability,
    getGitAvailability,
} from './projects/remote-project-import.model';
import { CreateProjectDrawer } from './sub-views/create-project-drawer.subview';
import { ProjectSettingsDrawer } from './sub-views/project-settings-drawer.subview';

type ProjectsViewProps = {
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
};

type ProjectFoldersMenuState = {
    project: ProjectDetails;
    anchorRect: ActionMenuAnchorRect;
    githubUrl: string | null;
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
        'installs',
        'common',
        'menus',
        'dialogs',
    ]);
    const [savingViewMode, setSavingViewMode] = useState(false);
    const savingViewModeRef = useRef(false);
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
    const [projectEditorInstallTargets, setProjectEditorInstallTargets] =
        useState<string[]>([]);
    const projectEditorInstallTargetRef = useRef(new Set<string>());
    const [highlightedPinnedProjectPath, setHighlightedPinnedProjectPath] =
        useState<string | null>(null);
    const clearPinnedHighlight = useCallback(
        () => setHighlightedPinnedProjectPath(null),
        [],
    );

    const { addAlert, addCustomConfirm } = useAlerts();
    const navigate = useNavigate();

    const { preferences, updatePreferences } = usePreferences();
    const projectViewMode: ProjectViewMode =
        preferences?.projects_view_mode === 'list' ? 'list' : 'cards';
    /**
     * Saves the presentation before changing it, retaining the old view on failure.
     * @param mode - The requested project presentation.
     */
    const setProjectViewMode = async (mode: ProjectViewMode) => {
        if (
            !preferences ||
            savingViewModeRef.current ||
            mode === projectViewMode
        )
            return;
        savingViewModeRef.current = true;
        setSavingViewMode(true);
        try {
            await updatePreferences({ projects_view_mode: mode });
        } catch {
            addAlert(t('common:error'), t('view.saveFailed'));
        } finally {
            savingViewModeRef.current = false;
            setSavingViewMode(false);
        }
    };
    const { listIntegrations: listToolIntegrations } = useToolIntegrations();
    const {
        installedReleases,
        availableReleases,
        availablePrereleases,
        downloadingReleases,
        installRelease,
        isInstalledRelease,
        checkAllReleasesValid,
    } = useRelease();
    const {
        projects,
        projectGitHubUrls,
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
        queueProjectEditorRepairs,
        launchProject,
        openProjectFolder,
        openProjectEditorFolder,
        renameProject,
        getProjectGodotName,
        removeProject,
        refreshProjects,
        loading,
    } = useProjects();
    const { openExternalLink } = useAppNavigation();
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
    const {
        handleAddProjectResult,
        onAddProject,
        importLocalProjects,
        localImportDialog,
    } = useAddProjectWorkflow({
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
        importLocalProjects,
    });

    /**
     * Checks whether the editor configured for a project is downloading.
     *
     * @param project - The project whose editor state is checked.
     * @returns Whether its editor is currently downloading.
     */
    const isProjectEditorDownloading = (project: ProjectDetails): boolean =>
        projectEditorInstallTargets.includes(
            `${project.release.version}:${project.release.mono}`,
        ) ||
        projectEditorInstallTargetRef.current.has(
            `${project.release.version}:${project.release.mono}`,
        ) ||
        downloadingReleases.some(
            (release) =>
                release.version === project.release.version &&
                release.mono === project.release.mono,
        );

    /**
     * Starts one exact official editor install and repairs every project
     * currently waiting for that editor.
     *
     * @param project - Project whose missing editor the user chose to install.
     * @param release - Exact catalogue release to install.
     */
    const onInstallRequiredProjectEditor = async (
        project: ProjectDetails,
        release: ReleaseSummary,
    ): Promise<void> => {
        const target = `${project.release.version}:${project.release.mono}`;
        if (
            projectEditorInstallTargetRef.current.has(target) ||
            downloadingReleases.some(
                (downloadingRelease) =>
                    downloadingRelease.version === project.release.version &&
                    downloadingRelease.mono === project.release.mono,
            )
        ) {
            return;
        }

        projectEditorInstallTargetRef.current.add(target);
        setProjectEditorInstallTargets((current) => [...current, target]);
        try {
            await queueProjectEditorRepairs([
                {
                    release,
                    mono: project.release.mono,
                    projects: projects.filter(
                        (candidate) =>
                            candidate.invalid_reason === 'missing_editor' &&
                            candidate.release.source !== 'custom' &&
                            candidate.release.version ===
                                project.release.version &&
                            candidate.release.mono === project.release.mono,
                    ),
                },
            ]);
        } catch (error) {
            addAlert(
                t('common:error'),
                error instanceof Error
                    ? error.message
                    : t('messages.addProjectError'),
            );
        } finally {
            projectEditorInstallTargetRef.current.delete(target);
            setProjectEditorInstallTargets((current) =>
                current.filter((candidate) => candidate !== target),
            );
        }
    };

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
    const viewState = getProjectsViewState({
        projectCount: projects.length,
        textSearch,
        projectsLoading: loading,
    });
    const showEmptyState = viewState === 'empty';

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop requires event handlers on container */}
            <div
                className="relative flex h-full min-h-0 w-full flex-col overflow-hidden p-1"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
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
                {isDraggingOver && <ProjectsDropOverlay t={t} />}
                {!showEmptyState && (
                    <ProjectsHeader
                        viewMode={projectViewMode}
                        onViewModeChange={(mode) =>
                            void setProjectViewMode(mode)
                        }
                        viewModeDisabled={savingViewMode || !preferences}
                        cardsViewLabel={t('view.cards')}
                        listViewLabel={t('view.list')}
                        title={t('title')}
                        projectsLocation={preferences?.projects_location}
                        searchPlaceholder={t('search.placeholder')}
                        searchValue={textSearch}
                        onSearchChange={setTextSearch}
                        onAddProject={openAddProjectSourceMenu}
                        onCreateProject={() => setCreateOpen(true)}
                        createDisabled={false}
                        addLabel={t('buttons.add')}
                        createLabel={t('buttons.newProject')}
                        copyPathLabel={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        showControls={!showEmptyState}
                    />
                )}

                {viewState === 'empty' && (
                    <ProjectsWelcome
                        gitAvailable={gitAvailability === 'available'}
                        t={t}
                        onCreateProject={() => setCreateOpen(true)}
                        onAddFromComputer={() => void onAddProject()}
                        onAddFromGitHub={() =>
                            openRemoteProjectSource('github')
                        }
                        onAddFromPublicGit={() =>
                            openRemoteProjectSource('public-git-url')
                        }
                    />
                )}
                {!showEmptyState && (
                    <>
                        <ContentDivider />
                        <ProjectsList
                            searchQuery={textSearch}
                            onClearSearch={() => setTextSearch('')}
                            viewMode={projectViewMode}
                            sections={projectSections}
                            projectGitHubUrls={projectGitHubUrls}
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
                            getDownloadableProjectEditor={(project) =>
                                findDownloadableMissingProjectEditor(
                                    project,
                                    availableReleases,
                                    availablePrereleases,
                                )
                            }
                            onInstallRequiredProjectEditor={(
                                project,
                                release,
                            ) =>
                                void onInstallRequiredProjectEditor(
                                    project,
                                    release,
                                )
                            }
                            onLaunchProject={(project) =>
                                void onLaunchProject(project)
                            }
                            onOpenTerminal={(project) =>
                                runProjectAction(async () => {
                                    const result =
                                        await terminalBridge.openProject(
                                            project.path,
                                        );
                                    if (!result.success) {
                                        if (
                                            result.reason ===
                                            'invalid-configuration'
                                        ) {
                                            addCustomConfirm(
                                                t('common:warning'),
                                                t(
                                                    'terminal.errors.invalid-configuration',
                                                ),
                                                [
                                                    {
                                                        isCancel: true,
                                                        typeClass: 'btn-ghost',
                                                        text: t(
                                                            'common:buttons.ok',
                                                        ),
                                                    },
                                                    {
                                                        typeClass:
                                                            'btn-primary',
                                                        text: t(
                                                            'terminal.openSettings',
                                                        ),
                                                        onClick: () => {
                                                            navigate(
                                                                `${appRoutePaths.settingsTab('tools')}?terminal=true`,
                                                            );
                                                            return true;
                                                        },
                                                    },
                                                ],
                                                undefined,
                                                'warning',
                                            );
                                            return;
                                        }
                                        const tone =
                                            result.reason === 'launch-failed'
                                                ? 'error'
                                                : 'warning';
                                        addAlert(
                                            t(`common:${tone}`),
                                            t(
                                                `terminal.errors.${result.reason}`,
                                            ),
                                            undefined,
                                            tone,
                                        );
                                    }
                                })
                            }
                            onProjectFoldersOptions={(event, project) => {
                                event.stopPropagation();
                                setProjectActionsMenu(null);
                                setProjectFoldersMenu({
                                    project,
                                    githubUrl:
                                        projectGitHubUrls.get(project.path) ??
                                        null,
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
                githubUrl={projectFoldersMenu?.githubUrl ?? null}
                t={t}
                onClose={() => setProjectFoldersMenu(null)}
                onOpenProjectFolder={(project) =>
                    runProjectAction(() => openProjectFolder(project))
                }
                onOpenEditorSettingsFolder={(project) =>
                    runProjectAction(() => openProjectEditorFolder(project))
                }
                onOpenGitHub={(url) =>
                    runProjectAction(() => openExternalLink(url))
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
                project={
                    projects.find(
                        (candidate) => candidate.path === editProjectFor?.path,
                    ) ?? editProjectFor
                }
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
            {localImportDialog}
            <RemoteProjectImportModal
                source={remoteProjectSource}
                onOpenChange={(open) => {
                    if (!open) {
                        setRemoteProjectSource(null);
                    }
                }}
                handleAddProjectResult={handleAddProjectResult}
                queueProjectEditorRepairs={queueProjectEditorRepairs}
            />
        </>
    );
};
