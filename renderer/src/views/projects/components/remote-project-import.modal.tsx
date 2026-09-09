import type {
    AddProjectOptions,
    AddProjectToListResult,
    RemoteDiscoveredProject,
    RemoteProjectImportProgress,
    RemoteProjectImportRequest,
    RemoteProjectSubmoduleActivity,
    RemoteRepositorySummary,
} from '@shared/contracts';
import {
    FolderOpen,
    GitBranch,
    GitPullRequest,
    Trash2,
    TriangleAlert,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { GitHubConnectionFlow } from '../../../components/github-connection/github-connection-flow.component';
import { useGit } from '../../../hooks/git.hook';
import { usePreferences } from '../../../hooks/preferences.hook';
import {
    type ProjectEditorRepairRequest,
    useProjects,
} from '../../../hooks/projects.hook';
import { useRelease } from '../../../hooks/release.hook';
import {
    appBridge,
    projectsBridge,
    subscribeAppEvent,
} from '../../../renderer.bridge';
import { getProjectPathSuffixDisplay } from '../../sub-views/create-project/create-project.model';
import { useRemoteProjectGitIdentity } from '../hooks/remote-project-git-identity.hook';
import {
    type LocalImportRow,
    prepareLocalImportRow,
} from '../local-import-editor.model';
import { getImportConflicts } from '../project-import-conflict.model';
import { getRemoteProjectProgressKey } from '../remote-project-import.messages';
import {
    appendRemoteRepositories,
    filterRemoteRepositories,
    getRemoteCodeEditorOptions,
    getRemoteImportFailureKey,
    getRemoteProjectDestinationDisplay,
    type RemoteProjectCodeEditorChoice,
    selectAllDiscoveredProjects,
    shouldShowRemoteProjectUseDefault,
} from '../remote-project-import.model';
import type {
    RemoteProjectImportStep,
    RemoteProjectPublicSourceFailure,
    RemoteProjectRegistrationOutcome,
    RemoteProjectRepositoryFailure,
    RemoteProjectSource,
    RemoteProjectSubmoduleActivityEntry,
} from '../remote-project-import.types';
import { registerResolvedRemoteProjectBatch } from '../remote-project-registration.service';
import {
    RemoteProjectCloneRecovery,
    RemoteProjectCloneRecoveryFooter,
} from './remote-project-clone-recovery.component';
import {
    RemoteProjectDestination,
    RemoteProjectDestinationFooter,
} from './remote-project-destination.component';
import {
    RemoteProjectGitIdentity,
    RemoteProjectGitIdentityFooter,
} from './remote-project-git-identity.component';
import {
    RemoteProjectImportFailure,
    RemoteProjectRegistrationResult,
} from './remote-project-import-result.component';
import { RemoteProjectReview } from './remote-project-review.component';
import {
    RemoteProjectPublicSource,
    RemoteProjectRepositorySource,
} from './remote-project-source.component';
import {
    RemoteProjectSubmodules,
    RemoteProjectSubmodulesFooter,
} from './remote-project-submodules.component';

export type { RemoteProjectSource } from '../remote-project-import.types';

type RemoteProjectImportModalProps = {
    source: RemoteProjectSource | null;
    onOpenChange: (open: boolean) => void;
    handleAddProjectResult: (
        projectPath: string,
        result: AddProjectToListResult,
        options?: AddProjectOptions,
    ) => Promise<boolean>;
    queueProjectEditorRepairs: (requests: ProjectEditorRepairRequest[]) => void;
};

const githubProviderId = 'github';

/** Renders the modal workflow for one remote Add Project source. */
export const RemoteProjectImportModal: React.FC<
    RemoteProjectImportModalProps
> = ({
    source,
    onOpenChange,
    handleAddProjectResult,
    queueProjectEditorRepairs,
}) => {
    const { t } = useTranslation([
        'projects',
        'common',
        'settings',
        'installEditor',
        'createProject',
    ]);
    const { preferences, platform } = usePreferences();
    const { addProject, codeEditorSettings, projects } = useProjects();
    const { availableReleases, availablePrereleases } = useRelease();

    const {
        getIdentitySettings,
        saveGlobalIdentity,
        saveProjectIdentityPreset,
    } = useGit();
    const [connectionFromPicker, setConnectionFromPicker] = useState(false);
    const [step, setStep] = useState<RemoteProjectImportStep>('source');
    const [cancelReturnStep, setCancelReturnStep] = useState<
        'review' | 'git-identity'
    >('review');
    const [publicUrl, setPublicUrl] = useState('');
    const [canonicalPublicUrl, setCanonicalPublicUrl] = useState('');
    const [publicError, setPublicError] =
        useState<RemoteProjectPublicSourceFailure | null>(null);
    const [inspectingPublicUrl, setInspectingPublicUrl] = useState(false);
    const [repositories, setRepositories] = useState<RemoteRepositorySummary[]>(
        [],
    );
    const [repositoryCursor, setRepositoryCursor] = useState<string | null>(
        null,
    );
    const [repositoryError, setRepositoryError] =
        useState<RemoteProjectRepositoryFailure | null>(null);
    const [loadingRepositories, setLoadingRepositories] = useState(false);
    const [loadingMoreRepositories, setLoadingMoreRepositories] =
        useState(false);
    const [repositorySearch, setRepositorySearch] = useState('');
    const [selectedRepository, setSelectedRepository] =
        useState<RemoteRepositorySummary | null>(null);
    const [parentDirectory, setParentDirectory] = useState('');
    const [directoryName, setDirectoryName] = useState('');
    const [selectingFolder, setSelectingFolder] = useState(false);
    const [progress, setProgress] =
        useState<RemoteProjectImportProgress | null>(null);
    const [importFailure, setImportFailure] = useState<string | null>(null);
    const [clonePreservedPath, setClonePreservedPath] = useState<string | null>(
        null,
    );

    const [cloneJobId, setCloneJobId] = useState<string | null>(null);
    const [cloneRecoveryAvailable, setCloneRecoveryAvailable] = useState(false);
    const [resolvingClone, setResolvingClone] = useState(false);
    const [cloneRecoveryError, setCloneRecoveryError] = useState<string | null>(
        null,
    );
    const [repositoryPath, setRepositoryPath] = useState('');
    const [submoduleActivities, setSubmoduleActivities] = useState<
        RemoteProjectSubmoduleActivityEntry[]
    >([]);
    const [submoduleFailure, setSubmoduleFailure] = useState<string | null>(
        null,
    );
    const [discoveredProjects, setDiscoveredProjects] = useState<
        RemoteDiscoveredProject[]
    >([]);
    const [selectedProjectPaths, setSelectedProjectPaths] = useState<
        Set<string>
    >(new Set());
    const [importNames, setImportNames] = useState<Record<string, string>>({});
    const [reviewRows, setReviewRows] = useState<LocalImportRow[]>([]);
    const [editorActionIds, setEditorActionIds] = useState<
        Record<string, string>
    >({});
    const [reviewEditing, setReviewEditing] = useState(false);
    const [codeEditorChoices, setCodeEditorChoices] = useState<
        Record<string, RemoteProjectCodeEditorChoice>
    >({});
    const [registrationOutcomes, setRegistrationOutcomes] = useState<
        RemoteProjectRegistrationOutcome[]
    >([]);
    const [editorDownloadsQueued, setEditorDownloadsQueued] = useState(false);
    const [registrationProgress, setRegistrationProgress] = useState({
        current: 0,
        total: 0,
    });
    const importPendingRef = useRef(false);
    const repositorySessionRef = useRef(0);
    const repositoryRequestRef = useRef(0);
    const activeJobIdRef = useRef<string | null>(null);
    const clonePreservedRef = useRef(false);
    const submoduleActivityIdRef = useRef(0);
    const publicUrlInputRef = useRef<HTMLInputElement>(null);
    const githubConnectionFlowRef = useRef<HTMLDivElement>(null);
    const gitIdentityPrimaryActionRef = useRef<HTMLButtonElement>(null);
    const remoteProjectPathInputRef = useRef<HTMLInputElement>(null);
    const initialiseSubmodulesButtonRef = useRef<HTMLButtonElement>(null);
    const addDiscoveredProjectsButtonRef = useRef<HTMLButtonElement>(null);
    const reviewAndRetryButtonRef = useRef<HTMLButtonElement>(null);
    const completionDoneButtonRef = useRef<HTMLButtonElement>(null);
    const cancelReviewBackButtonRef = useRef<HTMLButtonElement>(null);
    const selectAllRef = useRef<HTMLInputElement>(null);
    const gitIdentity = useRemoteProjectGitIdentity({
        cloneJobId,
        getIdentitySettings,
        saveGlobalIdentity,
        saveProjectIdentityPreset,
        onStepChange: setStep,
    });

    const open = source !== null;
    const remoteTitle =
        step === 'connection'
            ? t(
                  connectionFromPicker
                      ? 'settings:connections.drawer.title'
                      : 'settings:connections.flow.title',
              )
            : source === 'github'
              ? t('addProject.remote.github.title')
              : t('addProject.remote.public.title');
    const defaultParentDirectory = preferences?.projects_location ?? '';
    const destinationDisplay = getRemoteProjectDestinationDisplay(
        parentDirectory,
        directoryName,
        platform,
    );
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const pathSuffixDisplay = getProjectPathSuffixDisplay(
        parentDirectory,
        directoryName || '<repository>',
        pathSeparator,
    );
    const showUseDefaultPath = shouldShowRemoteProjectUseDefault(
        parentDirectory,
        defaultParentDirectory,
        platform,
    );
    const repositoryDisplay =
        source === 'github' && selectedRepository
            ? `${selectedRepository.owner}/${selectedRepository.name}`
            : canonicalPublicUrl;
    const filteredRepositories = useMemo(
        () => filterRemoteRepositories(repositories, repositorySearch),
        [repositories, repositorySearch],
    );
    const selectedCount = selectedProjectPaths.size;
    const allProjectsSelected =
        discoveredProjects.length > 0 &&
        selectedCount === discoveredProjects.length;
    const codeEditorOptions = useMemo(
        () => getRemoteCodeEditorOptions(t, codeEditorSettings),
        [codeEditorSettings, t],
    );

    const close = useCallback(() => {
        if (
            step === 'importing' ||
            step === 'initialising-submodules' ||
            step === 'registering-projects' ||
            gitIdentity.saving
        )
            return;
        if (cloneJobId && cloneRecoveryAvailable) {
            void projectsBridge.resolveRemoteProjectClone(cloneJobId, 'keep');
            setCloneRecoveryAvailable(false);
        }
        repositorySessionRef.current += 1;
        repositoryRequestRef.current += 1;
        onOpenChange(false);
    }, [
        cloneJobId,
        cloneRecoveryAvailable,
        onOpenChange,
        gitIdentity.saving,
        step,
    ]);

    /** Returns to a usable repository picker, or closes an unstarted import. */
    const cancelConnection = useCallback(() => {
        if (connectionFromPicker) {
            setStep('source');
        } else {
            close();
        }
    }, [close, connectionFromPicker]);

    const loadRepositories = useCallback(
        async (cursor?: string, append = false) => {
            const session = repositorySessionRef.current;
            const request = ++repositoryRequestRef.current;
            const isActiveRequest = () =>
                repositorySessionRef.current === session &&
                repositoryRequestRef.current === request;
            append
                ? setLoadingMoreRepositories(true)
                : setLoadingRepositories(true);
            setRepositoryError(null);
            try {
                const result = await projectsBridge.listConnectedRepositories(
                    githubProviderId,
                    cursor,
                );
                if (!isActiveRequest()) return;
                if (!result.ok) {
                    setRepositoryError(result.reason);
                    if (!append) {
                        setRepositories([]);
                        setRepositoryCursor(null);
                        setSelectedRepository(null);
                        if (result.reason === 'no-usable-connection') {
                            setConnectionFromPicker(false);
                            setStep('connection');
                        }
                    }
                } else {
                    setRepositories((current) =>
                        append
                            ? appendRemoteRepositories(
                                  current,
                                  result.page.repositories,
                              )
                            : result.page.repositories,
                    );
                    if (!append) {
                        setSelectedRepository((current) => {
                            if (!current) return null;
                            const next = result.page.repositories.find(
                                (repository) =>
                                    repository.repositoryRef ===
                                    current.repositoryRef,
                            );
                            return next && !next.alreadyImported ? next : null;
                        });
                    }
                    setRepositoryCursor(result.page.nextCursor);
                }
            } catch {
                if (!isActiveRequest()) return;
                setRepositoryError('provider-unavailable');
                if (!append) {
                    setRepositories([]);
                    setRepositoryCursor(null);
                    setSelectedRepository(null);
                }
            } finally {
                if (isActiveRequest()) {
                    append
                        ? setLoadingMoreRepositories(false)
                        : setLoadingRepositories(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        repositorySessionRef.current += 1;
        repositoryRequestRef.current += 1;
        if (!open) return;
        setStep('source');
        setConnectionFromPicker(false);
        setPublicUrl('');
        setCanonicalPublicUrl('');
        setPublicError(null);
        setInspectingPublicUrl(false);
        setRepositories([]);
        setRepositoryCursor(null);
        setRepositoryError(null);
        setLoadingRepositories(false);
        setLoadingMoreRepositories(false);
        setRepositorySearch('');
        setSelectedRepository(null);
        setParentDirectory(defaultParentDirectory);
        setDirectoryName('');
        setProgress(null);
        setImportFailure(null);
        setClonePreservedPath(null);
        setCloneJobId(null);
        setCloneRecoveryAvailable(false);
        setResolvingClone(false);
        setCloneRecoveryError(null);
        setRepositoryPath('');
        gitIdentity.reset();
        setSubmoduleActivities([]);
        setSubmoduleFailure(null);
        setDiscoveredProjects([]);
        setSelectedProjectPaths(new Set());
        setCodeEditorChoices({});
        setImportNames({});
        setReviewRows([]);
        setEditorActionIds({});
        setReviewEditing(false);
        setRegistrationOutcomes([]);
        setEditorDownloadsQueued(false);
        setRegistrationProgress({ current: 0, total: 0 });
        importPendingRef.current = false;
        activeJobIdRef.current = null;
        clonePreservedRef.current = false;
        submoduleActivityIdRef.current = 0;
        if (source === 'github') void loadRepositories();
    }, [
        defaultParentDirectory,
        gitIdentity.reset,
        loadRepositories,
        open,
        source,
    ]);

    useEffect(() => {
        if (!open) return;
        return subscribeAppEvent(
            'remote-project-import-progress',
            (nextProgress) => {
                if (!importPendingRef.current) return;
                if (!activeJobIdRef.current) {
                    activeJobIdRef.current = nextProgress.jobId;
                }
                if (activeJobIdRef.current === nextProgress.jobId) {
                    setProgress(nextProgress);
                    if (nextProgress.activity) {
                        submoduleActivityIdRef.current += 1;
                        setSubmoduleActivities((current) => [
                            ...current.slice(-99),
                            {
                                id: submoduleActivityIdRef.current,
                                activity:
                                    nextProgress.activity as RemoteProjectSubmoduleActivity,
                            },
                        ]);
                    }
                }
            },
        );
    }, [open]);

    useEffect(() => {
        if (!open || step !== 'destination') return;
        const input = remoteProjectPathInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }, [open, step]);

    useEffect(() => {
        if (open && step === 'cancel-review') {
            cancelReviewBackButtonRef.current?.focus();
        }
    }, [open, step]);

    useEffect(() => {
        if (!open) return;
        if (step === 'connection') {
            githubConnectionFlowRef.current
                ?.querySelector<HTMLButtonElement>(
                    '.btn-primary:not(:disabled)',
                )
                ?.focus();
        } else if (step === 'git-identity') {
            gitIdentityPrimaryActionRef.current?.focus();
        } else if (step === 'submodules') {
            initialiseSubmodulesButtonRef.current?.focus();
        } else if (step === 'review' && discoveredProjects.length > 0) {
            addDiscoveredProjectsButtonRef.current?.focus();
        } else if (step === 'import-failed' && !clonePreservedPath) {
            reviewAndRetryButtonRef.current?.focus();
        } else if (step === 'registration-complete') {
            completionDoneButtonRef.current?.focus();
        }
    }, [clonePreservedPath, discoveredProjects.length, open, step]);

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate =
                selectedCount > 0 && !allProjectsSelected;
        }
    }, [allProjectsSelected, selectedCount]);

    const inspectPublicSource = async () => {
        setInspectingPublicUrl(true);
        setPublicError(null);
        try {
            const result =
                await projectsBridge.inspectPublicGitSource(publicUrl);
            if (!result.ok) {
                setPublicError(result.reason);
                return;
            }
            setCanonicalPublicUrl(result.canonicalUrl);
            setDirectoryName(result.suggestedDirectoryName);
            setParentDirectory(defaultParentDirectory);
            setStep('destination');
        } catch {
            setPublicError('dns-unavailable');
        } finally {
            setInspectingPublicUrl(false);
        }
    };

    /**
     * Advances the selected connected repository to destination review.
     *
     * @param repository - Repository selected through the row or footer action.
     */
    const continueWithRepository = (
        repository: RemoteRepositorySummary | null,
    ) => {
        if (!repository || repository.alreadyImported) return;
        setSelectedRepository(repository);
        setDirectoryName(repository.name);
        setParentDirectory(defaultParentDirectory);
        setStep('destination');
    };

    const chooseParentDirectory = async () => {
        setSelectingFolder(true);
        try {
            const result = await appBridge.openDirectoryDialog(
                parentDirectory || defaultParentDirectory,
                t('addProject.remote.destination.selectParent'),
            );
            if (!result.canceled && result.filePaths[0]) {
                setParentDirectory(result.filePaths[0]);
            }
        } finally {
            setSelectingFolder(false);
        }
    };

    /** Inspects cloned projects and prepares the shared compact review rows.
     * @param discovered - Remote projects in repository discovery order.
     * @param preserveChoices - Whether still-valid names and editor choices remain selected.
     * @param refreshedResults - Current stale results to prefer over inspection metadata.
     */
    const prepareRemoteReviewRows = async (
        discovered: RemoteDiscoveredProject[],
        preserveChoices: boolean,
        refreshedResults: ReadonlyMap<
            string,
            AddProjectToListResult
        > = new Map(),
    ): Promise<boolean> => {
        try {
            const inspected = await projectsBridge.inspectProjectImports(
                discovered.map((project) => project.projectFilePath),
            );
            const nextRows = inspected.map((inspection) => {
                const refreshed = refreshedResults.get(
                    inspection.projectFilePath,
                );
                return prepareLocalImportRow(
                    {
                        ...inspection,
                        ...(refreshed?.editorResolution
                            ? {
                                  editorResolution: refreshed.editorResolution,
                                  editorRequest:
                                      refreshed.editorResolution.requested,
                              }
                            : {}),
                        name: preserveChoices
                            ? (importNames[inspection.projectFilePath] ??
                              inspection.name)
                            : inspection.name,
                    },
                    availableReleases,
                    availablePrereleases,
                );
            });
            setReviewRows(nextRows);
            setImportNames(
                Object.fromEntries(
                    nextRows.map((row) => [row.projectFilePath, row.name]),
                ),
            );
            setEditorActionIds(
                Object.fromEntries(
                    nextRows.map((row) => {
                        const previous = preserveChoices
                            ? editorActionIds[row.projectFilePath]
                            : undefined;
                        return [
                            row.projectFilePath,
                            previous &&
                            row.editorActions.some(
                                (action) => action.id === previous,
                            )
                                ? previous
                                : row.editorActionId,
                        ];
                    }),
                ),
            );
            return true;
        } catch {
            return false;
        }
    };

    const startImport = async () => {
        if (!source || !parentDirectory.trim() || !directoryName.trim()) return;
        const request: RemoteProjectImportRequest =
            source === 'public-git-url'
                ? {
                      source: 'public-git-url',
                      url: canonicalPublicUrl,
                      parentDirectory,
                      directoryName,
                  }
                : {
                      source: 'connected-repository',
                      providerId: githubProviderId,
                      repositoryRef: selectedRepository?.repositoryRef ?? '',
                      parentDirectory,
                      directoryName,
                  };
        setStep('importing');
        setImportFailure(null);
        setClonePreservedPath(null);
        setCloneJobId(null);
        setCloneRecoveryAvailable(false);
        setCloneRecoveryError(null);
        setProgress(null);
        importPendingRef.current = true;
        activeJobIdRef.current = null;
        try {
            const result = await projectsBridge.importRemoteProject(request);
            activeJobIdRef.current = result.jobId;
            if (!result.ok) {
                setImportFailure(getRemoteImportFailureKey(result.reason));
                setClonePreservedPath(result.repositoryPath ?? null);
                if (result.repositoryPath && result.jobId) {
                    setCloneJobId(result.jobId);
                    setCloneRecoveryAvailable(true);
                }
                setStep('import-failed');
                return;
            }
            setCloneJobId(result.jobId);
            setCloneRecoveryAvailable(true);
            setRepositoryPath(result.repositoryPath);
            setDiscoveredProjects(result.projects);
            setSelectedProjectPaths(
                selectAllDiscoveredProjects(result.projects),
            );
            setCodeEditorChoices({});
            setImportNames({});
            setReviewRows([]);
            setEditorActionIds({});
            setReviewEditing(false);
            if (!(await prepareRemoteReviewRows(result.projects, false))) {
                setImportFailure(
                    'addProject.remote.errors.temporarilyUnavailable',
                );
                setClonePreservedPath(result.repositoryPath);
                setStep('import-failed');
                return;
            }
            await gitIdentity.prepare(
                result.jobId,
                result.hasSubmodules ? 'submodules' : 'review',
            );
        } catch {
            setImportFailure('addProject.remote.errors.temporarilyUnavailable');
            setStep('import-failed');
        } finally {
            importPendingRef.current = false;
        }
    };

    const cancelImport = async () => {
        const jobId = activeJobIdRef.current;
        if (!jobId || !progress?.canCancel) return;
        await projectsBridge.cancelRemoteProjectImport(jobId);
    };

    /** Initialises validated public submodules and refreshes project discovery. */
    const initialiseSubmodules = async () => {
        if (!cloneJobId) return;
        setStep('initialising-submodules');
        setSubmoduleFailure(null);
        setSubmoduleActivities([]);
        setProgress(null);
        importPendingRef.current = true;
        activeJobIdRef.current = cloneJobId;
        try {
            const result =
                await projectsBridge.initialiseRemoteProjectSubmodules(
                    cloneJobId,
                );
            if (!result.ok) {
                if (result.reason === 'cancelled') {
                    setImportFailure(getRemoteImportFailureKey(result.reason));
                    setClonePreservedPath(repositoryPath);
                    setStep('import-failed');
                    return;
                }
                setSubmoduleFailure(result.reason);
                setStep('submodules');
                return;
            }
            setDiscoveredProjects(result.projects);
            setSelectedProjectPaths(
                selectAllDiscoveredProjects(result.projects),
            );
            setCodeEditorChoices({});
            setImportNames({});
            setReviewRows([]);
            setEditorActionIds({});
            setReviewEditing(false);
            if (!(await prepareRemoteReviewRows(result.projects, false))) {
                setSubmoduleFailure('submodule-unavailable');
                setStep('submodules');
                return;
            }
            setStep('review');
        } catch {
            setSubmoduleFailure('submodule-unavailable');
            setStep('submodules');
        } finally {
            importPendingRef.current = false;
        }
    };

    /** Opens the preserved final clone through the existing shell boundary. */
    const openPreservedClone = async () => {
        const clonePath = clonePreservedPath ?? repositoryPath;
        if (!clonePath) return;
        setCloneRecoveryError(null);
        try {
            await appBridge.openShellFolder(clonePath);
        } catch {
            setCloneRecoveryError(
                'addProject.remote.errors.cloneFolderOpenFailed',
            );
        }
    };

    /** Deletes the exact attempt-owned final clone and closes on success. */
    const deletePreservedClone = async () => {
        if (!cloneJobId || !cloneRecoveryAvailable) return;
        setResolvingClone(true);
        setCloneRecoveryError(null);
        try {
            const result = await projectsBridge.resolveRemoteProjectClone(
                cloneJobId,
                'delete',
            );
            if (result.status === 'deleted' || result.status === 'not-found') {
                setCloneRecoveryAvailable(false);
                onOpenChange(false);
                return;
            }
            if (result.status === 'changed') {
                setCloneRecoveryAvailable(false);
                setCloneRecoveryError(
                    'addProject.remote.errors.cloneCleanupChanged',
                );
                return;
            }
            setCloneRecoveryError(
                'addProject.remote.errors.cloneCleanupFailed',
            );
        } catch {
            setCloneRecoveryError(
                'addProject.remote.errors.cloneCleanupFailed',
            );
        } finally {
            setResolvingClone(false);
        }
    };

    const toggleAllProjects = (checked: boolean) => {
        setSelectedProjectPaths(
            checked
                ? selectAllDiscoveredProjects(discoveredProjects)
                : new Set(),
        );
    };

    const toggleProject = (projectFilePath: string, checked: boolean) => {
        setSelectedProjectPaths((current) => {
            const next = new Set(current);
            checked ? next.add(projectFilePath) : next.delete(projectFilePath);
            return next;
        });
    };

    /**
     * Stores the code-editor choice for one discovered project.
     *
     * @param projectFilePath - Discovered project.godot path.
     * @param choice - Automatic, none, or an explicit configured integration.
     */
    const setProjectCodeEditorChoice = (
        projectFilePath: string,
        choice: RemoteProjectCodeEditorChoice,
    ) => {
        setCodeEditorChoices((current) => ({
            ...current,
            [projectFilePath]: choice,
        }));
    };

    /** Keeps the completed clone once at least one project uses it. */
    const preserveRegisteredClone = () => {
        if (clonePreservedRef.current) return;
        clonePreservedRef.current = true;
        setCloneRecoveryAvailable(false);
        if (cloneJobId) {
            void projectsBridge.resolveRemoteProjectClone(cloneJobId, 'keep');
        }
    };

    /**
     * Checks selected projects and collects every missing Godot editor.
     *
     * @returns A promise that ends when the modal advances to its next step.
     */
    const selectedImportRows = reviewRows
        .filter((row) => selectedProjectPaths.has(row.projectFilePath))
        .map((row) => ({
            ...row,
            name: importNames[row.projectFilePath] ?? row.name,
            editorActionId:
                editorActionIds[row.projectFilePath] ?? row.editorActionId,
        }));
    const importConflicts = getImportConflicts(
        selectedImportRows,
        projects,
        platform,
    );
    const selectedDownloadCount = new Set(
        selectedImportRows.flatMap((row) => {
            const action = row.editorActions.find(
                (candidate) => candidate.id === row.editorActionId,
            );
            return action?.download
                ? [
                      `${action.download.version}:${row.editorRequest?.flavor ?? row.editorResolution?.requested.flavor}`,
                  ]
                : [];
        }),
    ).size;

    const registerSelectedProjects = async () => {
        const selected = selectedImportRows.map((project) => ({
            ...project,
            name: project.name.trim(),
        }));
        if (importConflicts.some(Boolean)) return;
        if (selected.length === 0) return;
        setStep('registering-projects');
        const previousSuccesses = registrationOutcomes.filter(
            (outcome) => outcome.status === 'added',
        );
        setRegistrationOutcomes(previousSuccesses);
        setRegistrationProgress({ current: 0, total: selected.length });
        const result = await registerResolvedRemoteProjectBatch({
            rows: selected,
            projects: discoveredProjects,
            codeEditorChoices,
            addProject,
            handleAddProjectResult,
            t,
            onProgress: (current, total) =>
                setRegistrationProgress({ current, total }),
            onOutcomesChange: (outcomes) =>
                setRegistrationOutcomes([...previousSuccesses, ...outcomes]),
        });

        if (result.outcomes.some((outcome) => outcome.status === 'added')) {
            preserveRegisteredClone();
        }
        queueProjectEditorRepairs(result.repairRequests);
        setEditorDownloadsQueued(result.repairRequests.length > 0);
        if (result.staleResults.size > 0) {
            const refreshed = await prepareRemoteReviewRows(
                discoveredProjects,
                true,
                result.staleResults,
            );
            if (!refreshed) {
                setRegistrationOutcomes((current) => [
                    ...current,
                    ...discoveredProjects
                        .filter((project) =>
                            result.staleResults.has(project.projectFilePath),
                        )
                        .map((project) => ({
                            project,
                            originalName:
                                reviewRows.find(
                                    (row) =>
                                        row.projectFilePath ===
                                        project.projectFilePath,
                                )?.godotName ?? project.name,
                            launcherName:
                                reviewRows.find(
                                    (row) =>
                                        row.projectFilePath ===
                                        project.projectFilePath,
                                )?.name ?? project.name,
                            status: 'failed' as const,
                            error: t(
                                'addProject.remote.errors.registration-failed',
                            ),
                        })),
                ]);
                setStep('registration-complete');
                return;
            }
            setSelectedProjectPaths(new Set(result.staleResults.keys()));
            setStep('review');
            return;
        }
        setStep('registration-complete');
    };

    if (!open || !source) return null;

    const connectionActionReasons: RemoteProjectRepositoryFailure[] = [
        'no-usable-connection',
        'secure-storage-unavailable',
        'reauthorisation-required',
    ];
    const showConnectionsAction =
        repositoryError !== null &&
        connectionActionReasons.includes(repositoryError);
    const sourceIcon =
        source === 'github' ? (
            <GitBranch aria-hidden="true" />
        ) : (
            <GitPullRequest aria-hidden="true" />
        );
    const cloneFolderPath = clonePreservedPath ?? (repositoryPath || null);
    const preservedCloneActions = cloneFolderPath ? (
        <div className="flex flex-wrap items-center gap-3">
            <button
                type="button"
                data-testid="btnOpenPreservedCloneFolder"
                className="btn btn-ghost text-base"
                disabled={resolvingClone}
                onClick={() => void openPreservedClone()}
            >
                <FolderOpen aria-hidden="true" size={16} />
                {t('addProject.remote.actions.openCloneFolder')}
            </button>
            {cloneRecoveryAvailable && (
                <button
                    type="button"
                    data-testid="btnDeletePreservedClone"
                    className="btn btn-ghost text-base text-error/80 hover:text-error hover:bg-error/20"
                    disabled={resolvingClone}
                    onClick={() => void deletePreservedClone()}
                >
                    <Trash2 aria-hidden="true" size={16} />
                    {t('addProject.remote.actions.deleteCloneAndClose')}
                </button>
            )}
        </div>
    ) : null;

    let body: React.ReactNode;
    let footer: React.ReactNode;

    if (step === 'source' && source === 'public-git-url') {
        body = (
            <RemoteProjectPublicSource
                url={publicUrl}
                error={publicError}
                inspecting={inspectingPublicUrl}
                inputRef={publicUrlInputRef}
                t={t}
                onUrlChange={(value) => {
                    setPublicUrl(value);
                    setPublicError(null);
                }}
                onContinue={() => void inspectPublicSource()}
            />
        );
        footer = (
            <>
                <button
                    type="button"
                    data-testid="btnCancelRemoteProjectImport"
                    className="btn btn-ghost text-base"
                    onClick={close}
                >
                    {t('common:buttons.cancel')}
                </button>
                <button
                    type="button"
                    data-testid="btnContinueRemoteProjectImport"
                    className="btn btn-primary text-base"
                    disabled={!publicUrl.trim() || inspectingPublicUrl}
                    onClick={() => void inspectPublicSource()}
                >
                    {inspectingPublicUrl && (
                        <span className="loading loading-spinner loading-sm" />
                    )}
                    {t('common:buttons.continue')}
                </button>
            </>
        );
    } else if (step === 'connection') {
        body = null;
        footer = null;
    } else if (step === 'source') {
        body = (
            <RemoteProjectRepositorySource
                loading={loadingRepositories}
                loadingMore={loadingMoreRepositories}
                error={repositoryError}
                repositories={filteredRepositories}
                selectedRepository={selectedRepository}
                search={repositorySearch}
                cursor={repositoryCursor}
                showConnectionsAction={showConnectionsAction}
                t={t}
                onSearchChange={setRepositorySearch}
                onSelect={setSelectedRepository}
                onContinue={continueWithRepository}
                onRetry={() => void loadRepositories()}
                onRefreshRepositories={loadRepositories}
                onLoadMore={(cursor) => void loadRepositories(cursor, true)}
                onOpenConnections={() => {
                    setConnectionFromPicker(true);
                    setStep('connection');
                }}
            />
        );
        footer = (
            <>
                <button
                    type="button"
                    data-testid="btnCancelRemoteProjectImport"
                    className="btn btn-ghost text-base"
                    onClick={close}
                >
                    {t('common:buttons.cancel')}
                </button>
                <button
                    type="button"
                    data-testid="btnContinueRemoteProjectImport"
                    className="btn btn-primary text-base"
                    disabled={!selectedRepository || Boolean(repositoryError)}
                    onClick={() => continueWithRepository(selectedRepository)}
                >
                    {t('common:buttons.continue')}
                </button>
            </>
        );
    } else if (step === 'destination') {
        body = (
            <RemoteProjectDestination
                repositoryDisplay={repositoryDisplay}
                parentDirectory={parentDirectory}
                defaultParentDirectory={defaultParentDirectory}
                destinationDisplay={destinationDisplay}
                pathSuffixDisplay={pathSuffixDisplay}
                showUseDefaultPath={showUseDefaultPath}
                selectingFolder={selectingFolder}
                inputRef={remoteProjectPathInputRef}
                t={t}
                onParentDirectoryChange={setParentDirectory}
                onChooseParentDirectory={() => void chooseParentDirectory()}
                onStartImport={() => void startImport()}
            />
        );
        footer = (
            <RemoteProjectDestinationFooter
                canStart={
                    parentDirectory.trim().length > 0 &&
                    directoryName.length > 0
                }
                t={t}
                onBack={() => setStep('source')}
                onCancel={close}
                onStartImport={() => void startImport()}
            />
        );
    } else if (step === 'importing') {
        body = (
            <div className="flex flex-col gap-4" role="status">
                <p>
                    {t(
                        `addProject.remote.progress.${getRemoteProjectProgressKey(progress)}`,
                    )}
                </p>
                <progress
                    className="progress progress-primary w-full"
                    value={progress?.percent}
                    max={100}
                />
                <code className="break-all rounded-box bg-base-200/60 p-3 font-mono text-sm">
                    {destinationDisplay}
                </code>
            </div>
        );
        footer = progress?.canCancel ? (
            <button
                type="button"
                data-testid="btnCancelRemoteProjectImport"
                className="btn btn-ghost text-base"
                onClick={() => void cancelImport()}
            >
                {t('addProject.remote.actions.cancelImport')}
            </button>
        ) : null;
    } else if (step === 'git-identity') {
        body = (
            <RemoteProjectGitIdentity
                page={gitIdentity.page}
                name={gitIdentity.name}
                email={gitIdentity.email}
                scope={gitIdentity.scope}
                saveChoice={gitIdentity.saveChoice}
                preset={gitIdentity.preset}
                globalIdentityComplete={gitIdentity.globalIdentityComplete}
                showValidation={gitIdentity.showValidation}
                saving={gitIdentity.saving}
                primaryActionRef={gitIdentityPrimaryActionRef}
                t={t}
                onNameChange={gitIdentity.setName}
                onEmailChange={gitIdentity.setEmail}
                onScopeChange={gitIdentity.setScope}
                onSaveChoiceChange={gitIdentity.setSaveChoice}
                onContinueWithoutIdentity={gitIdentity.continueAfterIdentity}
                onAddIdentity={gitIdentity.addIdentity}
                onUseGlobal={gitIdentity.continueAfterIdentity}
                onUseDifferentIdentity={gitIdentity.useDifferentIdentity}
                onUsePreset={() => void gitIdentity.applyPreset()}
                onBack={gitIdentity.returnFromForm}
                onSave={() => void gitIdentity.saveAndContinue()}
            />
        );
        footer = (
            <RemoteProjectGitIdentityFooter
                page={gitIdentity.page}
                preset={gitIdentity.preset}
                saving={gitIdentity.saving}
                globalIdentityComplete={gitIdentity.globalIdentityComplete}
                primaryActionRef={gitIdentityPrimaryActionRef}
                t={t}
                onContinueWithoutIdentity={gitIdentity.continueAfterIdentity}
                onUseGlobal={gitIdentity.continueAfterIdentity}
                onUseDifferentIdentity={gitIdentity.useDifferentIdentity}
                onUsePreset={() => void gitIdentity.applyPreset()}
                onBack={gitIdentity.returnFromForm}
                onSave={() => void gitIdentity.saveAndContinue()}
                onCancel={() => {
                    setCancelReturnStep('git-identity');
                    setStep('cancel-review');
                }}
            />
        );
    } else if (step === 'submodules' || step === 'initialising-submodules') {
        const initialising = step === 'initialising-submodules';
        body = (
            <RemoteProjectSubmodules
                initialising={initialising}
                failure={submoduleFailure}
                activities={submoduleActivities}
                t={t}
            />
        );
        footer = (
            <RemoteProjectSubmodulesFooter
                initialising={initialising}
                canCancel={Boolean(progress?.canCancel)}
                initialiseButtonRef={initialiseSubmodulesButtonRef}
                t={t}
                onCancel={() => void cancelImport()}
                onContinueWithoutSubmodules={() => setStep('review')}
                onInitialise={() => void initialiseSubmodules()}
            />
        );
    } else if (step === 'review') {
        body = (
            <RemoteProjectReview
                repositoryPath={repositoryPath}
                projects={discoveredProjects}
                rows={reviewRows}
                importNames={importNames}
                editorActionIds={editorActionIds}
                conflicts={Object.fromEntries(
                    selectedImportRows.map((p, i) => [
                        p.projectFilePath,
                        importConflicts[i],
                    ]),
                )}
                onNameChange={(file, name) =>
                    setImportNames((current) => ({ ...current, [file]: name }))
                }
                onEditingChange={setReviewEditing}
                onGodotEditorChange={(file, editorActionId) =>
                    setEditorActionIds((current) => ({
                        ...current,
                        [file]: editorActionId,
                    }))
                }
                selectedPaths={selectedProjectPaths}
                allSelected={allProjectsSelected}
                codeEditorChoices={codeEditorChoices}
                codeEditorOptions={codeEditorOptions}
                selectAllRef={selectAllRef}
                t={t}
                onToggleAll={toggleAllProjects}
                onToggleProject={toggleProject}
                onCodeEditorChange={setProjectCodeEditorChoice}
            />
        );
        footer =
            discoveredProjects.length === 0 ? (
                <div className="flex w-full items-center justify-between gap-4">
                    {preservedCloneActions}
                    <button
                        type="button"
                        data-testid="btnCloseRemoteProjectImport"
                        className="btn btn-primary text-base"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                </div>
            ) : (
                <>
                    <span className="mr-auto self-center text-sm text-base-content/60">
                        {t('addProject.editorReview.summary', {
                            count: selectedCount,
                            downloads: selectedDownloadCount,
                        })}
                    </span>
                    <button
                        type="button"
                        data-testid="btnCancelRemoteProjectImport"
                        className="btn btn-ghost text-base"
                        onClick={() => {
                            setCancelReturnStep('review');
                            setStep('cancel-review');
                        }}
                    >
                        {t('addProject.remote.actions.cancelImport')}
                    </button>
                    <button
                        ref={addDiscoveredProjectsButtonRef}
                        type="button"
                        data-testid="btnAddDiscoveredProjects"
                        className="btn btn-primary text-base"
                        disabled={
                            reviewEditing ||
                            selectedCount === 0 ||
                            importConflicts.some(Boolean)
                        }
                        onClick={() => void registerSelectedProjects()}
                    >
                        {t('addProject.remote.actions.addProjects', {
                            count: selectedCount,
                        })}
                    </button>
                </>
            );
    } else if (step === 'cancel-review') {
        body = (
            <RemoteProjectCloneRecovery
                path={repositoryPath}
                error={cloneRecoveryError}
                busy={resolvingClone}
                t={t}
                onOpen={() => void openPreservedClone()}
            />
        );
        footer = (
            <RemoteProjectCloneRecoveryFooter
                busy={resolvingClone}
                canDelete={cloneRecoveryAvailable}
                backRef={cancelReviewBackButtonRef}
                t={t}
                onBack={() => setStep(cancelReturnStep)}
                onKeep={close}
                onDelete={() => void deletePreservedClone()}
            />
        );
    } else if (step === 'registering-projects') {
        body = (
            <div className="flex flex-col gap-4" role="status">
                <p>
                    {t('addProject.remote.registration.adding', {
                        current: registrationProgress.current,
                        total: registrationProgress.total,
                    })}
                </p>
                <progress
                    className="progress progress-primary w-full"
                    value={registrationProgress.current}
                    max={registrationProgress.total}
                />
            </div>
        );
        footer = null;
    } else if (step === 'registration-complete') {
        body = (
            <RemoteProjectRegistrationResult
                outcomes={registrationOutcomes}
                editorDownloadsQueued={editorDownloadsQueued}
                cloneRecoveryError={cloneRecoveryError}
                t={t}
            />
        );
        footer = (
            <div className="flex w-full items-center justify-between gap-4">
                {preservedCloneActions}
                <div className="flex items-center justify-end gap-2">
                    {registrationOutcomes.some(
                        (outcome) => outcome.status === 'failed',
                    ) && (
                        <button
                            type="button"
                            className="btn btn-ghost text-base"
                            onClick={() => {
                                setSelectedProjectPaths(
                                    new Set(
                                        registrationOutcomes
                                            .filter(
                                                (outcome) =>
                                                    outcome.status === 'failed',
                                            )
                                            .map(
                                                (outcome) =>
                                                    outcome.project
                                                        .projectFilePath,
                                            ),
                                    ),
                                );
                                setStep('review');
                            }}
                        >
                            {t('addProject.remote.actions.reviewAndRetry')}
                        </button>
                    )}
                    <button
                        ref={completionDoneButtonRef}
                        type="button"
                        data-testid="btnCompleteRemoteProjectImport"
                        className="btn btn-primary text-base"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.done')}
                    </button>
                </div>
            </div>
        );
    } else {
        body = (
            <RemoteProjectImportFailure
                failure={importFailure}
                clonePreservedPath={clonePreservedPath}
                destinationDisplay={destinationDisplay}
                cloneRecoveryError={cloneRecoveryError}
                t={t}
            />
        );
        footer = (
            <div className="flex w-full items-center justify-between gap-4">
                {clonePreservedPath ? (
                    preservedCloneActions
                ) : (
                    <button
                        type="button"
                        data-testid="btnCloseRemoteProjectImport"
                        className="btn btn-ghost text-base"
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                )}
                {!clonePreservedPath && (
                    <button
                        ref={reviewAndRetryButtonRef}
                        type="button"
                        data-testid="btnReviewAndRetryRemoteImport"
                        className="btn btn-primary text-base"
                        onClick={() => setStep('destination')}
                    >
                        {t('addProject.remote.actions.reviewAndRetry')}
                    </button>
                )}
                {clonePreservedPath && (
                    <button
                        type="button"
                        data-testid="btnCloseRemoteProjectImport"
                        className="btn btn-primary text-base"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                )}
            </div>
        );
    }

    /**
     * Keeps each phase's actions in the import dialog footer.
     * @param content - Current phase content.
     * @param actions - Current phase footer actions.
     */
    const renderDialog = (
        content: React.ReactNode,
        actions: React.ReactNode,
    ) => (
        <Dialog
            tone={
                step === 'cancel-review'
                    ? 'warning'
                    : step === 'import-failed'
                      ? 'error'
                      : step === 'registration-complete'
                        ? registrationOutcomes.some(
                              (outcome) =>
                                  outcome.status === 'failed' ||
                                  outcome.status === 'skipped',
                          )
                            ? 'warning'
                            : 'success'
                        : 'neutral'
            }
            icon={
                [
                    'cancel-review',
                    'import-failed',
                    'registration-complete',
                ].includes(step)
                    ? undefined
                    : sourceIcon
            }
            testId="remoteProjectImportDialog"
            title={remoteTitle}
            footer={actions}
            onRequestClose={
                step === 'connection' ? cancelConnection : undefined
            }
            panelClassName="h-[85vh] max-w-5xl"
            bodyClassName={
                step === 'connection' ||
                step === 'review' ||
                step === 'registration-complete' ||
                step === 'submodules' ||
                step === 'initialising-submodules' ||
                (step === 'source' && source !== 'public-git-url')
                    ? 'flex flex-col overflow-hidden'
                    : undefined
            }
            initialFocusRef={
                source === 'public-git-url' ? publicUrlInputRef : undefined
            }
        >
            {gitIdentity.warning && (
                <div
                    className="alert alert-warning alert-soft mb-4 text-base text-warning-content dark:text-warning"
                    role="status"
                >
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>
                        {t(
                            gitIdentity.warning === 'preset'
                                ? 'addProject.remote.gitIdentity.presetWriteFailed'
                                : 'addProject.remote.gitIdentity.identityWriteFailed',
                        )}
                    </span>
                </div>
            )}
            {content}
        </Dialog>
    );

    if (step === 'connection') {
        return (
            <GitHubConnectionFlow
                onConnected={() => {
                    setRepositoryError(null);
                    setStep('source');
                    void loadRepositories();
                }}
                onCancel={cancelConnection}
                autoStart={connectionFromPicker}
                description={t('settings:connections.flow.importDescription')}
                renderLayout={(content, actions) =>
                    renderDialog(
                        <div
                            ref={githubConnectionFlowRef}
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        >
                            {content}
                        </div>,
                        actions,
                    )
                }
            />
        );
    }
    return renderDialog(body, footer);
};
