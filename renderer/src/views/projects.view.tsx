import type {
    CodeEditorId,
    ProjectDetails,
    ProjectEditorSelection,
    ProjectSectionKey,
    ReleaseSummary,
} from '@shared/contracts';
import {
    CheckSquare,
    CircleCheck,
    Pin,
    PinOff,
    Settings2,
    SquareMinus,
    Tag,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appRoutePaths } from '../app.routes';
import type { NotificationOptions } from '../components/notifications/notification.types';
import {
    ProjectTagFilter,
    type ProjectTagFilterHandle,
} from '../components/project-tags/project-tag-filter.component';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/action-menu.component';
import { ContentDivider } from '../components/ui/content-divider.component';
import { SelectionToolbar } from '../components/ui/selection-toolbar.component';
import { Tooltip } from '../components/ui/tooltip.component';
import { WaitingForDialogOverlay } from '../components/waiting-for-dialog-overlay.component';
import { useAlerts } from '../hooks/alerts.hook';
import { useAppNavigation } from '../hooks/app-navigation.hook';
import { useNotifications } from '../hooks/notifications.hook';
import { usePreferences } from '../hooks/preferences.hook';
import { useProjectTags } from '../hooks/project-tags.hook';
import { useProjects } from '../hooks/projects.hook';
import { useRelease } from '../hooks/release.hook';
import { useToolIntegrations } from '../hooks/tool-integrations.hook';
import { appBridge, projectsBridge, terminalBridge } from '../renderer.bridge';
import { AddProjectSourceMenu } from './projects/components/add-project-source-menu.component';
import { FolderProjectImportModal } from './projects/components/folder-project-import.modal';
import { ProjectActionsMenu } from './projects/components/project-actions-menu.component';
import { ProjectBulkTagsPopover } from './projects/components/project-bulk-tags-popover.component';
import { ProjectFoldersMenu } from './projects/components/project-folders-menu.component';
import { ProjectViewOptionsModal } from './projects/components/project-view-options.modal';
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
import { useProjectBatchNewStatus } from './projects/hooks/project-batch-new-status.hook';
import { useProjectBatchPins } from './projects/hooks/project-batch-pins.hook';
import { useProjectBatchTags } from './projects/hooks/project-batch-tags.hook';
import { useProjectDropImport } from './projects/hooks/project-drop-import.hook';
import { useProjectNewStatus } from './projects/hooks/project-new-status.hook';
import { useProjectSelection } from './projects/hooks/project-selection.hook';
import { getEligibleProjectPins } from './projects/project-bulk-pins.model';
import { findDownloadableMissingProjectEditor } from './projects/project-editor-resolution.model';
import { DEFAULT_PROJECT_GROUP_ORDER } from './projects/project-group-order.model';
import { getUniqueProjects } from './projects/project-selection.model';
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
 * Renders projects, available opening tools and project-management drawers.
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
    const [selectionMenu, setSelectionMenu] =
        useState<ActionMenuAnchorRect | null>(null);
    const [tagSession, setTagSession] = useState<{
        targets: ProjectDetails[];
        anchor: ActionMenuAnchorRect;
        filterKey: string;
    } | null>(null);
    const [reconcileTagSelection, setReconcileTagSelection] = useState(false);
    const tagBatchPending = useRef(false);
    const pinBatchPending = useRef(false);
    const tagCloseReturnsFocus = useRef(false);
    const [savingViewMode, setSavingViewMode] = useState(false);
    const savingViewModeRef = useRef(false);
    const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
    const [savingGroupOrder, setSavingGroupOrder] = useState(false);
    const savingGroupOrderRef = useRef(false);
    const viewOptionsButtonRef = useRef<HTMLButtonElement>(null);
    const [textSearch, setTextSearch] = useState<string>('');
    const [duplicateSource, setDuplicateSource] =
        useState<ProjectDetails | null>(null);
    const [localCreateOpen, setLocalCreateOpen] = useState<boolean>(false);
    const createOpen = controlledCreateOpen ?? localCreateOpen;
    const setCreateOpen = (open: boolean) => {
        if (!open) setDuplicateSource(null);
        if (onCreateOpenChange) {
            onCreateOpenChange(open);
            return;
        }

        setLocalCreateOpen(open);
    };

    const {
        snapshot: tagSnapshot,
        loadFailed: tagsLoadFailed,
        reload: reloadTags,
        save: saveProjectTags,
    } = useProjectTags();
    const [savingTagFilter, setSavingTagFilter] = useState(false);
    const savingTagFilterRef = useRef(false);
    const [editProjectFor, setEditProjectFor] = useState<ProjectDetails | null>(
        null,
    );
    const [projectFoldersMenu, setProjectFoldersMenu] =
        useState<ProjectFoldersMenuState | null>(null);
    const [addingProject, setAddingProject] = useState<boolean>(false);
    const [addSourceMenuAnchor, setAddSourceMenuAnchor] =
        useState<ActionMenuAnchorRect | null>(null);
    const [scanFolder, setScanFolder] = useState<string | null>(null);
    const [choosingScanFolder, setChoosingScanFolder] = useState(false);
    const scanPickerBusy = useRef(false);
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
    const { showNotification, dismissNotification, replaceNotification } =
        useNotifications();
    const groupOrderNotification = useRef<number | null>(null);
    const viewMounted = useRef(false);
    useEffect(() => {
        viewMounted.current = true;
        return () => {
            viewMounted.current = false;
            if (groupOrderNotification.current !== null)
                dismissNotification(groupOrderNotification.current);
        };
    }, [dismissNotification]);
    const navigate = useNavigate();

    const { preferences, updatePreferences, savePreferences, platform } =
        usePreferences();
    const searchInput = useRef<HTMLInputElement>(null);
    const tagFilterControl = useRef<ProjectTagFilterHandle>(null);
    const shortcutModifier = platform === 'darwin' ? '⌘' : 'Ctrl';
    const ariaShortcutModifier = platform === 'darwin' ? 'Meta' : 'Control';
    const selectedFilterTags = (preferences?.projects_tag_filter ?? []).flatMap(
        (id) => {
            const tag = tagSnapshot?.tags.find((tag) => tag.id === id);
            return tag ? [tag] : [];
        },
    );
    const selectedFilterIds = selectedFilterTags.map((tag) => tag.id);
    const savedFilterUnavailable =
        !tagSnapshot &&
        tagsLoadFailed &&
        !!preferences?.projects_tag_filter?.length;
    /** Saves tag filters while retaining the previous selection on failure.
     * @param ids - Existing tags to match against projects.
     */
    const setTagFilter = async (ids: string[]): Promise<boolean> => {
        if (
            !preferences ||
            savingTagFilterRef.current ||
            savingGroupOrderRef.current ||
            savingViewModeRef.current
        )
            return false;
        savingTagFilterRef.current = true;
        setSavingTagFilter(true);
        try {
            await updatePreferences({ projects_tag_filter: ids });
            return true;
        } catch {
            addAlert(t('common:error'), t('tags.filter.saveFailed'));
            return false;
        } finally {
            savingTagFilterRef.current = false;
            setSavingTagFilter(false);
        }
    };
    const projectViewMode: ProjectViewMode =
        preferences?.projects_view_mode === 'list' ||
        preferences?.projects_view_mode === 'dense'
            ? preferences.projects_view_mode
            : 'cards';
    /**
     * Saves the presentation before changing it, retaining the old view on failure.
     * @param mode - The requested project presentation.
     */
    const setProjectViewMode = async (mode: ProjectViewMode) => {
        if (
            !preferences ||
            savingViewModeRef.current ||
            savingGroupOrderRef.current ||
            savingTagFilterRef.current ||
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
    const projectGroupOrder =
        preferences?.projects_group_order ?? DEFAULT_PROJECT_GROUP_ORDER;
    /**
     * Shows a feature-owned confirmation using the reusable notification API.
     * @param order - Order described by the confirmation.
     * @param previousOrder - Optional previous order offered by Undo.
     * @param expectedId - Existing notification that owns an action result.
     */
    const notifyGroupOrder = (
        order: readonly ProjectSectionKey[],
        previousOrder?: readonly ProjectSectionKey[],
        expectedId?: number,
    ) => {
        const options: NotificationOptions = {
            title: t(
                previousOrder ? 'viewOptions.saved' : 'viewOptions.restored',
            ),
            description: order
                .map((group) => t(`sections.${group}`))
                .join(' > '),
            tone: 'success',
            returnFocusElement: viewOptionsButtonRef.current,
            actions: [
                ...(previousOrder
                    ? [
                          {
                              label: t('common:notifications.undo'),
                              variant: 'primary' as const,
                              onClick: async () => {
                                  const sourceNotificationId =
                                      groupOrderNotification.current;
                                  if (
                                      savingGroupOrderRef.current ||
                                      savingViewModeRef.current ||
                                      savingTagFilterRef.current
                                  )
                                      throw new Error(
                                          'A project preference save is already running',
                                      );
                                  savingGroupOrderRef.current = true;
                                  setSavingGroupOrder(true);
                                  try {
                                      const current =
                                          await appBridge.getUserPreferences();
                                      const currentOrder =
                                          current.projects_group_order ??
                                          DEFAULT_PROJECT_GROUP_ORDER;
                                      if (
                                          !order.every(
                                              (group, index) =>
                                                  group === currentOrder[index],
                                          )
                                      )
                                          throw new Error(
                                              'The project group order has changed',
                                          );
                                      await savePreferences({
                                          ...current,
                                          projects_group_order: [
                                              ...previousOrder,
                                          ],
                                      });
                                      if (
                                          viewMounted.current &&
                                          sourceNotificationId !== null
                                      )
                                          notifyGroupOrder(
                                              previousOrder,
                                              undefined,
                                              sourceNotificationId,
                                          );
                                  } finally {
                                      savingGroupOrderRef.current = false;
                                      if (viewMounted.current)
                                          setSavingGroupOrder(false);
                                  }
                              },
                          },
                      ]
                    : []),
                {
                    label: t('viewOptions.title'),
                    variant: 'secondary' as const,
                    onClick: () => setViewOptionsOpen(true),
                },
            ],
        };
        const id =
            expectedId === undefined
                ? showNotification(options)
                : replaceNotification(expectedId, options);
        if (id !== null) groupOrderNotification.current = id;
    };
    /**
     * Saves a group order before applying it to the project list.
     * @param order - All project groups in their requested display order.
     */
    const saveProjectGroupOrder = async (
        order: ProjectSectionKey[],
    ): Promise<boolean> => {
        if (
            !preferences ||
            savingGroupOrderRef.current ||
            savingViewModeRef.current ||
            savingTagFilterRef.current
        )
            return false;
        savingGroupOrderRef.current = true;
        setSavingGroupOrder(true);
        try {
            await updatePreferences({ projects_group_order: order });
            setViewOptionsOpen(false);
            notifyGroupOrder(order, projectGroupOrder);
            return true;
        } catch {
            return false;
        } finally {
            savingGroupOrderRef.current = false;
            setSavingGroupOrder(false);
        }
    };
    const { listIntegrations: listToolIntegrations } = useToolIntegrations();
    const {
        installedReleases,
        availableReleases,
        availablePrereleases,
        downloadingReleases,
        getReleaseInstallProgress,
        cancelInstall,
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
        setProjectLaunchWithConsole,
        setProjectPinned,
        reorderPinnedProjects,
        clearProjectNewStatus,
        undoClearProjectNewStatus,
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
        openProjectCodeEditor,
        openProjectFolder,
        openProjectEditorFolder,
        renameProject,
        getProjectGodotName,
        removeProject,
        refreshProjects,
        loading,
    } = useProjects();
    const { openExternalLink } = useAppNavigation();
    const { clearNewStatus } = useProjectNewStatus({
        projects,
        clearProjectNewStatus,
        undoClearProjectNewStatus,
    });
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

    const [terminalAvailable, setTerminalAvailable] = useState(true);

    /** Refreshes Git and terminal actions from the shared tool summaries. */
    const refreshToolAvailability = useCallback(async () => {
        setGitAvailability('loading');
        try {
            const integrations = await listToolIntegrations();
            setGitAvailability(getGitAvailability(integrations));
            setTerminalAvailable(
                integrations.some(
                    (integration) =>
                        integration.id === 'terminal' &&
                        integration.status === 'available',
                ),
            );
        } catch {
            setGitAvailability('unavailable');
        }
    }, [listToolIntegrations]);

    useEffect(() => {
        void refreshToolAvailability();
    }, [refreshToolAvailability]);

    const openAddProjectSourceMenu: React.MouseEventHandler<
        HTMLButtonElement
    > = (event) => {
        setAddSourceMenuAnchor(getActionMenuAnchorRect(event.currentTarget));
        void refreshToolAvailability();
    };

    /** Opens the native picker before starting a single-folder scan. */
    const chooseScanFolder = async () => {
        if (scanPickerBusy.current) return;
        scanPickerBusy.current = true;
        setAddSourceMenuAnchor(null);
        setChoosingScanFolder(true);
        try {
            const selected = await appBridge.openFileDialog(
                preferences?.projects_location ?? '',
                t('projects:addProject.folder.title'),
                [],
                ['openDirectory'],
            );
            if (!selected.canceled && selected.filePaths.length === 1) {
                setScanFolder(selected.filePaths[0]);
            }
        } catch {
            addAlert(
                t('common:error'),
                t('projects:addProject.folder.pickerFailed'),
            );
        } finally {
            setChoosingScanFolder(false);
            scanPickerBusy.current = false;
        }
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

    /**
     * Saves the selected editor and returns its canonical project state.
     * @param project - Project being edited.
     * @param release - Installed editor or official catalogue selection.
     */
    const onSetProjectEditorFromSettings = async (
        project: ProjectDetails,
        release: ProjectEditorSelection,
    ): Promise<ProjectDetails> => {
        setBusyProjects([...busyProjects, project.path]);

        try {
            const result = await setProjectEditor(project, release);
            if (!result.success) {
                throw new Error(result.error || t('messages.setEditorError'));
            }

            const updatedProject = result.projects?.find(
                (candidate) => candidate.path === project.path,
            );
            if (!updatedProject) {
                throw new Error(t('messages.setEditorError'));
            }
            return updatedProject;
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

    const projectSections = getProjectSections(
        projects,
        textSearch,
        selectedFilterIds,
        tagSnapshot?.assignments,
    );
    const batchNewStatus = useProjectBatchNewStatus({
        projects,
        isBlocked: () =>
            tagSession !== null ||
            reconcileTagSelection ||
            tagBatchPending.current ||
            pinBatchPending.current,
        clearProjectNewStatus,
        undoClearProjectNewStatus,
    });
    const batchTags = useProjectBatchTags(
        projects,
        () => batchNewStatus.busy || pinBatchPending.current,
    );
    tagBatchPending.current = batchTags.busy;
    const batchPins = useProjectBatchPins({
        isBlocked: () =>
            batchNewStatus.busy ||
            tagBatchPending.current ||
            tagSession !== null ||
            reconcileTagSelection,
        setProjectPinned: (project, pinned) =>
            projectsBridge.setProjectPinned(project, pinned),
        reorderPinnedProjects: (paths) =>
            projectsBridge.reorderPinnedProjects(paths),
    });
    pinBatchPending.current = batchPins.busy;
    const projectFilterKey = JSON.stringify([
        textSearch,
        [...(preferences?.projects_tag_filter ?? [])].sort(),
    ]);
    const activeTagSession =
        tagSession?.filterKey === projectFilterKey ? tagSession : null;
    const selectionBusy =
        batchNewStatus.busy ||
        batchTags.busy ||
        batchPins.busy ||
        activeTagSession !== null;
    const sectionProjects = {
        pinned: projectSections.pinnedProjects,
        new: projectSections.newProjects,
        recents: projectSections.recentProjects,
    };
    const shownProjects = projectGroupOrder.flatMap(
        (key) => sectionProjects[key],
    );
    const selection = useProjectSelection({
        projects,
        shownProjects,
        filterKey: projectFilterKey,
        busy: selectionBusy,
    });
    const orderedSelection = getUniqueProjects(
        [...shownProjects, ...selection.selectedProjects],
        selection.selectedPaths,
    );
    const eligiblePins = getEligibleProjectPins(orderedSelection, true);
    const eligibleUnpins = getEligibleProjectPins(orderedSelection, false);
    useEffect(() => {
        if (tagSession && tagSession.filterKey !== projectFilterKey)
            setTagSession(null);
        if (reconcileTagSelection && !batchTags.busy) {
            selection.retainShown();
            setReconcileTagSelection(false);
            if (tagCloseReturnsFocus.current) {
                tagCloseReturnsFocus.current = false;
                requestAnimationFrame(() => {
                    if (document.activeElement !== document.body) return;
                    document
                        .querySelector<HTMLButtonElement>(
                            '[data-project-selection-toolbar] button[aria-haspopup]',
                        )
                        ?.focus({ preventScroll: true });
                });
            }
        }
    }, [
        tagSession,
        projectFilterKey,
        reconcileTagSelection,
        batchTags.busy,
        selection.retainShown,
    ]);
    /** Ends the frozen-target session, reconciling after any pending save finishes.
     * @param restoreFocus - Whether keyboard or explicit closure should return to Actions.
     */
    const closeBulkTags = (restoreFocus: boolean) => {
        tagCloseReturnsFocus.current = restoreFocus;
        setTagSession(null);
        setReconcileTagSelection(true);
    };
    const viewState = getProjectsViewState({
        projectCount: projects.length,
        tagFilterActive:
            selectedFilterIds.length > 0 ||
            (!tagSnapshot && !!preferences?.projects_tag_filter?.length),
        textSearch,
        projectsLoading: loading,
    });
    const showEmptyState = viewState === 'empty';

    useEffect(() => {
        /** Routes Projects shortcuts unless another dialog owns keyboard input.
         * @param event - Keyboard event from the active window.
         */
        const handleShortcut = (event: KeyboardEvent) => {
            if (
                showEmptyState ||
                event.defaultPrevented ||
                event.isComposing ||
                event.repeat ||
                event.altKey ||
                event.shiftKey
            )
                return;
            const modifier =
                platform === 'darwin'
                    ? event.metaKey && !event.ctrlKey
                    : event.ctrlKey && !event.metaKey;
            const key = event.key.toLowerCase();
            if (!modifier || (key !== 't' && key !== 'k')) return;
            const tagPanel = tagFilterControl.current?.getPanel();
            const blocked = Array.from(
                document.querySelectorAll<HTMLElement>(
                    'dialog[open], [role="dialog"], [role="alertdialog"], :popover-open',
                ),
            ).some(
                (element) =>
                    element !== tagPanel &&
                    element.getClientRects().length > 0 &&
                    getComputedStyle(element).visibility !== 'hidden',
            );
            if (blocked) return;
            event.preventDefault();
            if (key === 't') tagFilterControl.current?.open();
            else {
                tagFilterControl.current?.close();
                searchInput.current?.focus({ preventScroll: true });
                searchInput.current?.select();
            }
        };
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [platform, showEmptyState]);

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
                <ProjectsHeader
                    searchInputRef={searchInput}
                    searchShortcut={`${shortcutModifier} K`}
                    searchAriaKeyShortcuts={`${ariaShortcutModifier}+K`}
                    viewMode={projectViewMode}
                    onViewModeChange={(mode) => void setProjectViewMode(mode)}
                    viewModeDisabled={
                        savingViewMode ||
                        savingTagFilter ||
                        savingGroupOrder ||
                        !preferences
                    }
                    viewOptions={
                        <Tooltip
                            tip={t('viewOptions.title')}
                            placement="top"
                            delay={1000}
                        >
                            <button
                                ref={viewOptionsButtonRef}
                                type="button"
                                className="btn btn-ghost btn-sm btn-square"
                                data-testid="btnProjectViewOptions"
                                aria-label={t('viewOptions.title')}
                                aria-haspopup="dialog"
                                disabled={
                                    !preferences ||
                                    savingViewMode ||
                                    savingTagFilter ||
                                    savingGroupOrder
                                }
                                onClick={() => setViewOptionsOpen(true)}
                            >
                                <Settings2 size={17} aria-hidden="true" />
                            </button>
                        </Tooltip>
                    }
                    selectionTools={
                        <div data-project-selection-toolbar="">
                            <SelectionToolbar
                                enabled={selection.enabled}
                                selectedCount={
                                    activeTagSession?.targets.length ??
                                    selection.selectedProjects.length
                                }
                                disabled={
                                    loading ||
                                    selectionBusy ||
                                    savingTagFilter ||
                                    !preferences
                                }
                                actionsOpen={
                                    selectionMenu !== null ||
                                    activeTagSession !== null
                                }
                                t={t}
                                onToggle={() => {
                                    setSelectionMenu(null);
                                    selection.toggleEnabled();
                                }}
                                onOpenActions={(event) =>
                                    setSelectionMenu(
                                        getActionMenuAnchorRect(
                                            event.currentTarget,
                                        ),
                                    )
                                }
                            />
                        </div>
                    }
                    tagFilter={
                        <ProjectTagFilter
                            controlRef={tagFilterControl}
                            shortcut={`${shortcutModifier} T`}
                            ariaKeyShortcuts={`${ariaShortcutModifier}+T`}
                            tags={tagSnapshot?.tags ?? []}
                            selected={selectedFilterTags}
                            disabled={!preferences || !tagSnapshot}
                            saving={
                                savingTagFilter ||
                                savingViewMode ||
                                savingGroupOrder
                            }
                            loadFailed={tagsLoadFailed}
                            onRetry={reloadTags}
                            onChange={setTagFilter}
                        />
                    }
                    cardsViewLabel={t('view.cards')}
                    listViewLabel={t('view.list')}
                    compactViewLabel={t('view.compact')}
                    title={t('title')}
                    projectsLocation={
                        showEmptyState
                            ? undefined
                            : preferences?.projects_location
                    }
                    searchPlaceholder={t('search.placeholder')}
                    searchValue={textSearch}
                    onSearchChange={setTextSearch}
                    onAddProject={openAddProjectSourceMenu}
                    onCreateProject={() => {
                        setDuplicateSource(null);
                        setCreateOpen(true);
                    }}
                    createDisabled={false}
                    addLabel={t('buttons.add')}
                    createLabel={t('buttons.newProject')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                    showControls={!showEmptyState}
                    showAddMenu
                />

                {viewState === 'empty' && (
                    <ProjectsWelcome
                        gitAvailable={gitAvailability === 'available'}
                        t={t}
                        onCreateProject={() => {
                            setDuplicateSource(null);
                            setCreateOpen(true);
                        }}
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
                        {savedFilterUnavailable ? (
                            <div
                                role="alert"
                                className="flex flex-1 items-center justify-center gap-3"
                            >
                                <span>{t('tags.loadFailed')}</span>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => void reloadTags()}
                                >
                                    {t('tags.retry')}
                                </button>
                            </div>
                        ) : (
                            <ProjectsList
                                selectionEnabled={selection.enabled}
                                selectedProjectPaths={selection.selectedPaths}
                                selectionBusy={selectionBusy}
                                onToggleSelection={selection.toggleProject}
                                onToggleSectionSelection={
                                    selection.toggleSection
                                }
                                searchQuery={textSearch}
                                onClearSearch={() => {
                                    if (selectedFilterIds.length) {
                                        void setTagFilter([]).then((saved) => {
                                            if (saved) setTextSearch('');
                                        });
                                    } else setTextSearch('');
                                }}
                                clearSearchLabel={
                                    selectedFilterIds.length
                                        ? t('tags.filter.clearAll')
                                        : undefined
                                }
                                viewMode={projectViewMode}
                                groupOrder={projectGroupOrder}
                                sections={projectSections}
                                projectGitHubUrls={projectGitHubUrls}
                                loading={
                                    loading ||
                                    (!tagSnapshot &&
                                        !tagsLoadFailed &&
                                        !!preferences?.projects_tag_filter
                                            ?.length)
                                }
                                locale={
                                    i18n.resolvedLanguage ??
                                    i18n.language ??
                                    'en'
                                }
                                busyProjects={busyProjects}
                                codeEditorSettings={codeEditorSettings}
                                terminalAvailable={terminalAvailable}
                                highlightedPinnedProjectPath={
                                    highlightedPinnedProjectPath
                                }
                                pinnedReorderingDisabled={
                                    selection.enabled ||
                                    textSearch.trim().length > 0 ||
                                    selectedFilterIds.length > 0
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
                                getReleaseInstallProgress={
                                    getReleaseInstallProgress
                                }
                                onCancelEditorInstall={cancelInstall}
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
                                onOpenCodeEditor={(project) =>
                                    runProjectAction(() =>
                                        openProjectCodeEditor(project),
                                    )
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
                                                            typeClass:
                                                                'btn-ghost',
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
                                                result.reason ===
                                                'launch-failed'
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
                                            projectGitHubUrls.get(
                                                project.path,
                                            ) ?? null,
                                        anchorRect: getActionMenuAnchorRect(
                                            event.currentTarget,
                                        ),
                                    });
                                }}
                                onTogglePinned={handleToggleProjectPinned}
                                tagSnapshot={tagSnapshot}
                                tagsLoadFailed={tagsLoadFailed}
                                onRetryTags={reloadTags}
                                onSetProjectTags={saveProjectTags}
                                onProjectSettings={setEditProjectFor}
                                onProjectMoreOptions={(event, project) => {
                                    setProjectFoldersMenu(null);
                                    void onProjectMoreOptions(event, project);
                                }}
                                t={t}
                            />
                        )}
                    </>
                )}
            </div>
            <ActionMenu
                open={
                    selectionMenu !== null &&
                    selection.enabled &&
                    !selectionBusy
                }
                anchorRect={selectionMenu}
                ariaLabel={t('selection.actions')}
                align="start"
                items={[
                    {
                        key: 'select-all',
                        icon: <CheckSquare size={16} />,
                        label: t('selection.selectAll'),
                        disabled: selection.shownCount === 0,
                        onSelect: selection.selectAll,
                    },
                    {
                        key: 'select-new',
                        icon: <CircleCheck size={16} />,
                        label: t('selection.selectNew'),
                        disabled: selection.newCount === 0,
                        onSelect: selection.selectNew,
                    },
                    {
                        key: 'clear-selection',
                        icon: <SquareMinus size={16} />,
                        label: t('selection.clear'),
                        disabled: selection.selectedProjects.length === 0,
                        onSelect: selection.clear,
                    },
                    { type: 'separator', key: 'selection-actions-divider' },
                    {
                        key: 'pin',
                        icon: <Pin size={16} />,
                        label: t('selection.pin', {
                            count: eligiblePins.length,
                        }),
                        disabled: eligiblePins.length === 0,
                        onSelect: () => batchPins.change(eligiblePins, true),
                    },
                    {
                        key: 'unpin',
                        icon: <PinOff size={16} />,
                        label: t('selection.unpin', {
                            count: eligibleUnpins.length,
                        }),
                        disabled: eligibleUnpins.length === 0,
                        onSelect: () => batchPins.change(eligibleUnpins, false),
                    },
                    {
                        key: 'tags',
                        icon: <Tag size={16} />,
                        label: t('selection.tags'),
                        disabled: selection.selectedProjects.length === 0,
                        onSelect: () => {
                            if (!selectionMenu) return;
                            batchTags.clearFailure();
                            setTagSession({
                                targets: [...selection.selectedProjects],
                                anchor: selectionMenu,
                                filterKey: projectFilterKey,
                            });
                        },
                    },
                    {
                        key: 'clear-new',
                        icon: <CircleCheck size={16} />,
                        label: t('selection.clearNew', {
                            count: selection.eligibleNew.length,
                        }),
                        disabled: selection.eligibleNew.length === 0,
                        onSelect: () =>
                            batchNewStatus.clearNew(selection.eligibleNew),
                    },
                ]}
                onClose={() => setSelectionMenu(null)}
            />
            {activeTagSession && (
                <ProjectBulkTagsPopover
                    targets={activeTagSession.targets}
                    anchor={activeTagSession.anchor}
                    snapshot={tagSnapshot}
                    loadFailed={tagsLoadFailed}
                    busy={batchTags.busy}
                    failure={batchTags.failure}
                    onReload={reloadTags}
                    onChange={batchTags.change}
                    onClose={closeBulkTags}
                />
            )}
            <ProjectFoldersMenu
                showCopyProjectPath={projectViewMode === 'dense'}
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
                onScanFolder={() => void chooseScanFolder()}
                onPublicGit={() => openRemoteProjectSource('public-git-url')}
                onGitHub={() => openRemoteProjectSource('github')}
            />
            <ProjectActionsMenu
                project={projectActionsMenu?.project ?? null}
                anchorRect={projectActionsMenu?.anchorRect ?? null}
                t={t}
                onClose={() => setProjectActionsMenu(null)}
                onDuplicateProject={(project) => {
                    setProjectActionsMenu(null);
                    setDuplicateSource(project);
                    setCreateOpen(true);
                }}
                onExportEditorSettings={(project) =>
                    runProjectAction(() => exportProjectEditorSettings(project))
                }
                onImportEditorSettings={handleImportEditorSettings}
                onRemoveProject={handleRemoveProject}
                onClearNewStatus={(project) => void clearNewStatus(project)}
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
                onSetProjectLaunchWithConsole={setProjectLaunchWithConsole}
                onInitializeProjectGit={initializeProjectGit}
                getProjectGitIdentity={getProjectGitIdentity}
                onSetProjectGitIdentity={setProjectGitIdentity}
                onResetProjectCodeEditorConfig={onResetProjectCodeEditorConfig}
                getProjectGodotName={getProjectGodotName}
            />
            <CreateProjectDrawer
                sourceProject={duplicateSource}
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
            {viewOptionsOpen && (
                <ProjectViewOptionsModal
                    order={projectGroupOrder}
                    saving={savingGroupOrder}
                    returnFocusRef={viewOptionsButtonRef}
                    onSave={saveProjectGroupOrder}
                    onClose={() => setViewOptionsOpen(false)}
                />
            )}
            {choosingScanFolder && (
                <WaitingForDialogOverlay
                    message={t('projects:addProject.folder.picker')}
                />
            )}
            {scanFolder && (
                <FolderProjectImportModal
                    key={scanFolder}
                    folder={scanFolder}
                    onClose={() => setScanFolder(null)}
                    onChooseFolder={() => {
                        setScanFolder(null);
                        void chooseScanFolder();
                    }}
                    handleAddProjectResult={handleAddProjectResult}
                    queueProjectEditorRepairs={queueProjectEditorRepairs}
                />
            )}
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
