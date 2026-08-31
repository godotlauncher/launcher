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
import { useNavigate } from 'react-router';
import { appBridge, projectsBridge, subscribeAppEvent } from '../../../bridge';
import { Dialog } from '../../../components/dialog.component';
import { useGit } from '../../../hooks/git.hook';
import { usePreferences } from '../../../hooks/usePreferences';
import {
    type ProjectEditorRepairRequest,
    useProjects,
} from '../../../hooks/useProjects';
import { useRelease } from '../../../hooks/useRelease';
import { appRoutePaths } from '../../../routes';
import { getProjectPathSuffixDisplay } from '../../subViews/createProject/createProject.model';
import { useRemoteProjectGitIdentity } from '../hooks/remote-project-git-identity.hook';
import {
    createRemoteProjectEditorPlan,
    type RemoteProjectEditorChoice,
    type RemoteProjectEditorPlanGroup,
} from '../remote-project-editor-plan.model';
import { getRemoteProjectProgressKey } from '../remote-project-import.messages';
import {
    appendRemoteRepositories,
    filterRemoteRepositories,
    filterSelectedDiscoveredProjects,
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
import {
    applyRemoteProjectEditorPlan,
    registerRemoteProjectBatch,
} from '../remote-project-registration.service';

import {
    RemoteProjectDestination,
    RemoteProjectDestinationFooter,
} from './remote-project-destination.component';
import {
    RemoteProjectEditorResolution,
    RemoteProjectEditorResolutionFooter,
} from './remote-project-editor-resolution.component';
import { RemoteProjectGitIdentity } from './remote-project-git-identity.component';
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
    const navigate = useNavigate();
    const { preferences, platform } = usePreferences();
    const { addProject, codeEditorSettings, projects } = useProjects();
    const { availableReleases, availablePrereleases } = useRelease();

    const {
        getIdentitySettings,
        saveGlobalIdentity,
        saveProjectIdentityPreset,
    } = useGit();
    const [step, setStep] = useState<RemoteProjectImportStep>('source');
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
    const [codeEditorChoices, setCodeEditorChoices] = useState<
        Record<string, RemoteProjectCodeEditorChoice>
    >({});
    const [registrationOutcomes, setRegistrationOutcomes] = useState<
        RemoteProjectRegistrationOutcome[]
    >([]);
    const [editorPlan, setEditorPlan] = useState<
        RemoteProjectEditorPlanGroup[]
    >([]);
    const [editorDownloadsQueued, setEditorDownloadsQueued] = useState(false);
    const [registrationProgress, setRegistrationProgress] = useState({
        current: 0,
        total: 0,
    });
    const importPendingRef = useRef(false);
    const activeJobIdRef = useRef<string | null>(null);
    const clonePreservedRef = useRef(false);
    const submoduleActivityIdRef = useRef(0);
    const publicUrlInputRef = useRef<HTMLInputElement>(null);
    const gitIdentityPrimaryActionRef = useRef<HTMLButtonElement>(null);
    const remoteProjectPathInputRef = useRef<HTMLInputElement>(null);
    const initialiseSubmodulesButtonRef = useRef<HTMLButtonElement>(null);
    const addDiscoveredProjectsButtonRef = useRef<HTMLButtonElement>(null);
    const reviewAndRetryButtonRef = useRef<HTMLButtonElement>(null);
    const applyEditorPlanButtonRef = useRef<HTMLButtonElement>(null);
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
        source === 'github'
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
            step === 'checking-projects' ||
            step === 'registering-projects' ||
            gitIdentity.saving
        )
            return;
        if (cloneJobId && cloneRecoveryAvailable) {
            void projectsBridge.resolveRemoteProjectClone(cloneJobId, 'keep');
            setCloneRecoveryAvailable(false);
        }
        onOpenChange(false);
    }, [
        cloneJobId,
        cloneRecoveryAvailable,
        onOpenChange,
        gitIdentity.saving,
        step,
    ]);

    const loadRepositories = useCallback(
        async (cursor?: string, append = false) => {
            append
                ? setLoadingMoreRepositories(true)
                : setLoadingRepositories(true);
            setRepositoryError(null);
            try {
                const result = await projectsBridge.listConnectedRepositories(
                    githubProviderId,
                    cursor,
                );
                if (!result.ok) {
                    setRepositoryError(result.reason);
                    if (!append) {
                        setRepositories([]);
                        setRepositoryCursor(null);
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
                    setRepositoryCursor(result.page.nextCursor);
                }
            } catch {
                setRepositoryError('provider-unavailable');
                if (!append) {
                    setRepositories([]);
                    setRepositoryCursor(null);
                }
            } finally {
                append
                    ? setLoadingMoreRepositories(false)
                    : setLoadingRepositories(false);
            }
        },
        [],
    );

    useEffect(() => {
        if (!open) return;
        setStep('source');
        setPublicUrl('');
        setCanonicalPublicUrl('');
        setPublicError(null);
        setInspectingPublicUrl(false);
        setRepositories([]);
        setRepositoryCursor(null);
        setRepositoryError(null);
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
        setRegistrationOutcomes([]);
        setEditorPlan([]);
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
        if (step === 'git-identity') {
            gitIdentityPrimaryActionRef.current?.focus();
        } else if (step === 'submodules') {
            initialiseSubmodulesButtonRef.current?.focus();
        } else if (step === 'review' && discoveredProjects.length > 0) {
            addDiscoveredProjectsButtonRef.current?.focus();
        } else if (step === 'import-failed' && !clonePreservedPath) {
            reviewAndRetryButtonRef.current?.focus();
        } else if (step === 'editors-required') {
            applyEditorPlanButtonRef.current?.focus();
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
    const registerSelectedProjects = async () => {
        const selected = filterSelectedDiscoveredProjects(
            discoveredProjects,
            selectedProjectPaths,
        );
        if (selected.length === 0) return;
        setStep('checking-projects');
        setRegistrationOutcomes([]);
        setEditorPlan([]);
        setRegistrationProgress({ current: 0, total: selected.length });
        const result = await registerRemoteProjectBatch({
            selectedProjects: selected,
            existingProjects: projects,
            codeEditorChoices,
            platform,
            addProject,
            handleAddProjectResult,
            t,
            onProgress: (current, total) =>
                setRegistrationProgress({ current, total }),
            onOutcomesChange: setRegistrationOutcomes,
        });

        if (result.outcomes.some((outcome) => outcome.status === 'added')) {
            preserveRegisteredClone();
        }

        const plan = createRemoteProjectEditorPlan(
            result.editorCandidates,
            availableReleases,
            availablePrereleases,
        );
        setEditorPlan(plan);
        setStep(plan.length > 0 ? 'editors-required' : 'registration-complete');
    };

    /**
     * Stores one resolution choice from the Editors required screen.
     *
     * @param key - Stable editor-plan group key.
     * @param choice - Resolution selected for the group.
     */
    const setEditorPlanChoice = (
        key: string,
        choice: RemoteProjectEditorChoice,
    ) => {
        setEditorPlan((current) =>
            current.map((group) =>
                group.key === key ? { ...group, choice } : group,
            ),
        );
    };

    /** Finishes without registering projects that still need editor resolution. */
    const finishWithoutRemainingProjects = () => {
        setRegistrationOutcomes((current) => [
            ...current,
            ...editorPlan.flatMap((group) =>
                group.candidates.map(({ project }) => ({
                    project,
                    status: 'skipped' as const,
                    error: t('addProject.remote.registration.notAdded'),
                })),
            ),
        ]);
        setStep('registration-complete');
    };

    /** Registers pending projects and hands editor repairs to the background queue. */
    const applyEditorPlan = async () => {
        const projectCount = editorPlan.reduce(
            (count, group) => count + group.candidates.length,
            0,
        );
        setRegistrationProgress({ current: 0, total: projectCount });
        setStep('registering-projects');
        const result = await applyRemoteProjectEditorPlan({
            plan: editorPlan,
            addProject,
            handleAddProjectResult,
            t,
            onProgress: (current, total) =>
                setRegistrationProgress({ current, total }),
        });

        setRegistrationOutcomes((current) => [...current, ...result.outcomes]);
        if (result.outcomes.some((outcome) => outcome.status === 'added')) {
            preserveRegisteredClone();
        }
        queueProjectEditorRepairs(result.repairRequests);
        setEditorDownloadsQueued(result.repairRequests.length > 0);
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
                className="btn btn-ghost"
                disabled={resolvingClone}
                onClick={() => void openPreservedClone()}
            >
                <FolderOpen aria-hidden="true" size={18} />
                {t('addProject.remote.actions.openCloneFolder')}
            </button>
            {cloneRecoveryAvailable && (
                <button
                    type="button"
                    data-testid="btnDeletePreservedClone"
                    className="btn btn-error"
                    disabled={resolvingClone}
                    onClick={() => void deletePreservedClone()}
                >
                    <Trash2 aria-hidden="true" size={18} />
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
                <button type="button" className="btn btn-ghost" onClick={close}>
                    {t('common:buttons.cancel')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
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
                onLoadMore={(cursor) => void loadRepositories(cursor, true)}
                onOpenConnections={() => {
                    onOpenChange(false);
                    navigate(appRoutePaths.settingsTab('connections'));
                }}
            />
        );
        footer = (
            <>
                <button type="button" className="btn btn-ghost" onClick={close}>
                    {t('common:buttons.cancel')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
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
                <code className="break-all rounded-box bg-base-200 p-3">
                    {destinationDisplay}
                </code>
            </div>
        );
        footer = progress?.canCancel ? (
            <button
                type="button"
                className="btn btn-ghost"
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
        footer = null;
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
                        className="btn btn-primary"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                </div>
            ) : (
                <>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setStep('cancel-review')}
                    >
                        {t('addProject.remote.actions.cancelImport')}
                    </button>
                    <button
                        ref={addDiscoveredProjectsButtonRef}
                        type="button"
                        data-testid="btnAddDiscoveredProjects"
                        className="btn btn-primary"
                        disabled={selectedCount === 0}
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
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-semibold">
                        {t('addProject.remote.review.cancelTitle')}
                    </h2>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.review.cancelDescription')}
                    </p>
                </div>
                <code className="break-all rounded-box bg-base-200 p-3 text-sm">
                    {repositoryPath}
                </code>
                {cloneRecoveryError && (
                    <div className="alert alert-error alert-soft" role="alert">
                        <TriangleAlert aria-hidden="true" size={18} />
                        <span>{t(cloneRecoveryError)}</span>
                    </div>
                )}
            </div>
        );
        footer = (
            <div className="flex w-full items-center justify-between gap-4">
                <button
                    ref={cancelReviewBackButtonRef}
                    type="button"
                    className="btn btn-ghost"
                    disabled={resolvingClone}
                    onClick={() => setStep('review')}
                >
                    {t('common:buttons.back')}
                </button>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={resolvingClone}
                        onClick={() => void openPreservedClone()}
                    >
                        <FolderOpen aria-hidden="true" size={18} />
                        {t('addProject.remote.actions.openCloneFolder')}
                    </button>
                    <button
                        type="button"
                        data-testid="btnKeepPreservedClone"
                        className="btn btn-neutral"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.keepCloneAndClose')}
                    </button>
                    {cloneRecoveryAvailable && (
                        <button
                            type="button"
                            data-testid="btnDeletePreservedClone"
                            className="btn btn-error"
                            disabled={resolvingClone}
                            onClick={() => void deletePreservedClone()}
                        >
                            <Trash2 aria-hidden="true" size={18} />
                            {t('addProject.remote.actions.deleteCloneAndClose')}
                        </button>
                    )}
                </div>
            </div>
        );
    } else if (step === 'checking-projects') {
        body = (
            <div className="flex flex-col gap-4" role="status">
                <p>
                    {t('addProject.remote.editorBatch.checking', {
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
    } else if (step === 'editors-required') {
        body = (
            <RemoteProjectEditorResolution
                repositoryPath={repositoryPath}
                plan={editorPlan}
                t={t}
                onChoiceChange={setEditorPlanChoice}
            />
        );
        footer = (
            <RemoteProjectEditorResolutionFooter
                plan={editorPlan}
                applyButtonRef={applyEditorPlanButtonRef}
                t={t}
                onFinishWithoutRemaining={finishWithoutRemainingProjects}
                onApply={() => void applyEditorPlan()}
            />
        );
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
                <button
                    ref={completionDoneButtonRef}
                    type="button"
                    data-testid="btnCompleteRemoteProjectImport"
                    className="btn btn-primary"
                    disabled={resolvingClone}
                    onClick={close}
                >
                    {t('addProject.remote.actions.done')}
                </button>
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
                        className="btn btn-ghost"
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
                        className="btn btn-primary"
                        onClick={() => setStep('destination')}
                    >
                        {t('addProject.remote.actions.reviewAndRetry')}
                    </button>
                )}
                {clonePreservedPath && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={resolvingClone}
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                )}
            </div>
        );
    }

    return (
        <Dialog
            icon={sourceIcon}
            title={remoteTitle}
            footer={footer}
            panelClassName="h-[85vh] max-w-5xl"
            initialFocusRef={
                source === 'public-git-url' ? publicUrlInputRef : undefined
            }
        >
            {gitIdentity.warning && (
                <div
                    className="alert alert-warning alert-soft mb-4"
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
            {body}
        </Dialog>
    );
};
