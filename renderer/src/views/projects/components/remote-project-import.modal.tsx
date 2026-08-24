import type {
    AddProjectOptions,
    AddProjectToListResult,
    ListConnectedRepositoriesResult,
    PublicGitSourceInspectionResult,
    RemoteDiscoveredProject,
    RemoteProjectImportProgress,
    RemoteProjectImportRequest,
    RemoteRepositorySummary,
} from '@shared/contracts';
import {
    Check,
    CircleMinus,
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
import { ReleaseInstallProgressIndicator } from '../../../components/releaseInstallProgress.component';
import { SearchField } from '../../../components/ui/searchField.component';
import { SelectField } from '../../../components/ui/selectField.component';
import { usePreferences } from '../../../hooks/usePreferences';
import { useProjects } from '../../../hooks/useProjects';
import { useRelease } from '../../../hooks/useRelease';
import { appRoutePaths } from '../../../routes';
import { getProjectPathSuffixDisplay } from '../../subViews/createProject/createProject.model';
import type { ProjectEditorInstallTarget } from '../hooks/useAddProjectWorkflow';
import {
    appendRemoteRepositories,
    filterRemoteRepositories,
    filterSelectedDiscoveredProjects,
    getProjectDirectoryFromFilePath,
    getRemoteAddProjectOptions,
    getRemoteCodeEditorOptions,
    getRemoteDetectedEditorLabel,
    getRemoteImportFailureKey,
    getRemoteProjectDestinationDisplay,
    getRemoteRepositoryRowClassName,
    handOffRemoteProjectRegistration,
    type RemoteProjectCodeEditorChoice,
    selectAllDiscoveredProjects,
    shouldShowRemoteProjectUseDefault,
} from '../remote-project-import.model';

export type RemoteProjectSource = 'public-git-url' | 'github';

type RemoteProjectImportModalProps = {
    source: RemoteProjectSource | null;
    onOpenChange: (open: boolean) => void;
    handleAddProjectResult: (
        projectPath: string,
        result: AddProjectToListResult,
        options?: AddProjectOptions,
    ) => Promise<boolean>;
    editorInstallTargets: ProjectEditorInstallTarget[];
};

type ModalStep =
    | 'source'
    | 'destination'
    | 'importing'
    | 'import-failed'
    | 'review'
    | 'registering'
    | 'registration-complete';

type RegistrationOutcome = {
    project: RemoteDiscoveredProject;
    status: 'added' | 'skipped' | 'failed';
    error?: string;
};

type RepositoryFailure = Extract<
    ListConnectedRepositoriesResult,
    { ok: false }
>['reason'];

type PublicSourceFailure = Extract<
    PublicGitSourceInspectionResult,
    { ok: false }
>['reason'];

const githubProviderId = 'github';

/**
 * Maps public-source inspection failures to their translation key suffix.
 *
 * @param reason - Typed public source failure.
 */
function getPublicSourceFailureKey(reason: PublicSourceFailure): string {
    return reason === 'dns-unavailable' ? 'dnsUnavailable' : 'invalid';
}

/**
 * Maps repository-list failures to their translation key suffix.
 *
 * @param reason - Typed repository list failure.
 */
function getRepositoryFailureKey(reason: RepositoryFailure): string {
    if (
        reason === 'no-usable-connection' ||
        reason === 'secure-storage-unavailable' ||
        reason === 'reauthorisation-required'
    ) {
        return 'connectionRequired';
    }
    return reason === 'session-expired' || reason === 'invalid-request'
        ? 'sessionExpired'
        : 'temporarilyUnavailable';
}

/**
 * Maps import progress to the message shown for its current stage.
 *
 * @param progress - Latest remote import progress.
 */
function getProgressKey(progress: RemoteProjectImportProgress | null): string {
    if (progress?.stage === 'cloning') return 'cloning';
    if (progress?.stage === 'cancelling') return 'cancelling';
    if (progress?.stage === 'discovering-projects') return 'discovering';
    return 'preparing';
}

/**
 * Normalises a project path for renderer-side duplicate preflight.
 *
 * @param value - Project directory path.
 * @param platform - Current operating-system platform.
 */
function normaliseProjectPath(value: string, platform?: string): string {
    const normalised = value.replace(/\\/g, '/').replace(/\/+$/, '');
    return platform === 'win32' ? normalised.toLocaleLowerCase() : normalised;
}

/** Renders the modal workflow for one remote Add Project source. */
export const RemoteProjectImportModal: React.FC<
    RemoteProjectImportModalProps
> = ({
    source,
    onOpenChange,
    handleAddProjectResult,
    editorInstallTargets,
}) => {
    const { t } = useTranslation([
        'projects',
        'common',
        'settings',
        'installEditor',
    ]);
    const navigate = useNavigate();
    const { preferences, platform } = usePreferences();
    const { addProject, codeEditorSettings, projects } = useProjects();
    const { getReleaseInstallProgress } = useRelease();
    const [step, setStep] = useState<ModalStep>('source');
    const [publicUrl, setPublicUrl] = useState('');
    const [canonicalPublicUrl, setCanonicalPublicUrl] = useState('');
    const [publicError, setPublicError] = useState<PublicSourceFailure | null>(
        null,
    );
    const [inspectingPublicUrl, setInspectingPublicUrl] = useState(false);
    const [repositories, setRepositories] = useState<RemoteRepositorySummary[]>(
        [],
    );
    const [repositoryCursor, setRepositoryCursor] = useState<string | null>(
        null,
    );
    const [repositoryError, setRepositoryError] =
        useState<RepositoryFailure | null>(null);
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
        RegistrationOutcome[]
    >([]);
    const [registrationProgress, setRegistrationProgress] = useState({
        current: 0,
        total: 0,
    });
    const importPendingRef = useRef(false);
    const activeJobIdRef = useRef<string | null>(null);
    const publicUrlInputRef = useRef<HTMLInputElement>(null);
    const selectAllRef = useRef<HTMLInputElement>(null);

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
        if (step === 'importing' || step === 'registering') return;
        if (cloneJobId && cloneRecoveryAvailable) {
            void projectsBridge.resolveRemoteProjectClone(cloneJobId, 'keep');
            setCloneRecoveryAvailable(false);
        }
        onOpenChange(false);
    }, [cloneJobId, cloneRecoveryAvailable, onOpenChange, step]);

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
        setDiscoveredProjects([]);
        setSelectedProjectPaths(new Set());
        setCodeEditorChoices({});
        setRegistrationOutcomes([]);
        setRegistrationProgress({ current: 0, total: 0 });
        importPendingRef.current = false;
        activeJobIdRef.current = null;
        if (source === 'github') void loadRepositories();
    }, [defaultParentDirectory, loadRepositories, open, source]);

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
                }
            },
        );
    }, [open]);

    useEffect(() => {
        if (open && step === 'source' && source === 'public-git-url') {
            publicUrlInputRef.current?.focus();
        }
    }, [open, source, step]);

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

    const continueWithRepository = () => {
        if (!selectedRepository || selectedRepository.alreadyImported) return;
        setDirectoryName(selectedRepository.name);
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
            setStep('review');
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

    const registerSelectedProjects = async () => {
        const selected = filterSelectedDiscoveredProjects(
            discoveredProjects,
            selectedProjectPaths,
        );
        if (selected.length === 0) return;
        setStep('registering');
        setRegistrationOutcomes([]);
        setRegistrationProgress({ current: 0, total: selected.length });
        const knownNames = new Set(projects.map((project) => project.name));
        const knownPaths = new Set(
            projects.map((project) =>
                normaliseProjectPath(project.path, platform),
            ),
        );
        const outcomes: RegistrationOutcome[] = [];

        for (let index = 0; index < selected.length; index++) {
            const project = selected[index];
            setRegistrationProgress({
                current: index + 1,
                total: selected.length,
            });
            const projectDirectory = getProjectDirectoryFromFilePath(
                project.projectFilePath,
            );
            const normalisedDirectory = normaliseProjectPath(
                projectDirectory,
                platform,
            );
            let outcome: RegistrationOutcome;

            if (
                knownNames.has(project.name) ||
                knownPaths.has(normalisedDirectory)
            ) {
                outcome = {
                    project,
                    status: 'skipped',
                    error: t('addProject.remote.registration.alreadyAdded'),
                };
            } else {
                try {
                    const handoff = await handOffRemoteProjectRegistration(
                        project.projectFilePath,
                        addProject,
                        handleAddProjectResult,
                        getRemoteAddProjectOptions(
                            codeEditorChoices[project.projectFilePath] ??
                                'auto',
                        ),
                    );
                    if (handoff.handled) {
                        outcome = {
                            project,
                            status: handoff.added ? 'added' : 'skipped',
                            error: handoff.added
                                ? undefined
                                : t('addProject.remote.registration.notAdded'),
                        };
                        if (handoff.added) {
                            knownNames.add(project.name);
                            knownPaths.add(normalisedDirectory);
                        }
                    } else {
                        outcome = {
                            project,
                            status: 'failed',
                            error:
                                handoff.error ??
                                t(
                                    'addProject.remote.errors.registration-failed',
                                ),
                        };
                    }
                } catch {
                    outcome = {
                        project,
                        status: 'failed',
                        error: t(
                            'addProject.remote.errors.registration-failed',
                        ),
                    };
                }
            }
            outcomes.push(outcome);
            setRegistrationOutcomes([...outcomes]);
        }
        if (outcomes.some((outcome) => outcome.status === 'added')) {
            setCloneRecoveryAvailable(false);
            if (cloneJobId) {
                void projectsBridge.resolveRemoteProjectClone(
                    cloneJobId,
                    'keep',
                );
            }
        }
        setStep('registration-complete');
    };

    if (!open || !source) return null;

    const connectionActionReasons: RepositoryFailure[] = [
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
            <div className="flex flex-col gap-4">
                <p>{t('addProject.remote.public.description')}</p>
                <label className="form-control gap-2">
                    <span className="font-medium">
                        {t('addProject.remote.public.urlLabel')}
                    </span>
                    <input
                        ref={publicUrlInputRef}
                        type="url"
                        data-testid="inputPublicGitRepositoryUrl"
                        className="input input-bordered w-full"
                        value={publicUrl}
                        placeholder={t(
                            'addProject.remote.public.urlPlaceholder',
                        )}
                        onChange={(event) => {
                            setPublicUrl(event.target.value);
                            setPublicError(null);
                        }}
                    />
                </label>
                {publicError && (
                    <div className="alert alert-error alert-soft" role="alert">
                        <TriangleAlert aria-hidden="true" size={18} />
                        <span>
                            {t(
                                `addProject.remote.public.errors.${getPublicSourceFailureKey(publicError)}`,
                            )}
                        </span>
                    </div>
                )}
            </div>
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
            <div className="flex h-full min-h-0 flex-col gap-4">
                <p>{t('addProject.remote.github.description')}</p>
                {loadingRepositories ? (
                    <div className="flex items-center gap-2" role="status">
                        <span className="loading loading-spinner loading-sm" />
                        {t('addProject.remote.github.loading')}
                    </div>
                ) : repositoryError ? (
                    <div className="flex flex-col gap-3">
                        <div
                            className="alert alert-error alert-soft"
                            role="alert"
                        >
                            <TriangleAlert aria-hidden="true" size={18} />
                            <span>
                                {t(
                                    `addProject.remote.github.errors.${getRepositoryFailureKey(repositoryError)}`,
                                )}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            {showConnectionsAction && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        onOpenChange(false);
                                        navigate(
                                            appRoutePaths.settingsTab(
                                                'connections',
                                            ),
                                        );
                                    }}
                                >
                                    {t(
                                        'addProject.remote.github.openConnections',
                                    )}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-neutral btn-sm"
                                onClick={() => void loadRepositories()}
                            >
                                {t('common:buttons.retry')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <SearchField
                            placeholder={t(
                                'addProject.remote.github.searchPlaceholder',
                            )}
                            value={repositorySearch}
                            onChange={setRepositorySearch}
                            focusOnMount
                            data-testid="inputGitHubRepositorySearch"
                        />
                        {repositoryCursor && (
                            <p className="text-xs text-base-content/60">
                                {t('addProject.remote.github.loadedSearchOnly')}
                            </p>
                        )}
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                            {filteredRepositories.length === 0 ? (
                                <p>{t('addProject.remote.github.empty')}</p>
                            ) : (
                                filteredRepositories.map((repository) => (
                                    <button
                                        type="button"
                                        key={repository.repositoryRef}
                                        disabled={repository.alreadyImported}
                                        title={
                                            repository.alreadyImported
                                                ? t(
                                                      'addProject.remote.github.alreadyAdded',
                                                  )
                                                : undefined
                                        }
                                        aria-pressed={
                                            selectedRepository?.repositoryRef ===
                                            repository.repositoryRef
                                        }
                                        className={getRemoteRepositoryRowClassName(
                                            selectedRepository?.repositoryRef ===
                                                repository.repositoryRef,
                                        )}
                                        onClick={() =>
                                            setSelectedRepository(repository)
                                        }
                                    >
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                            {repository.owner}/{repository.name}
                                        </span>
                                        {selectedRepository?.repositoryRef ===
                                            repository.repositoryRef && (
                                            <Check
                                                aria-hidden="true"
                                                className="h-5 w-5 shrink-0 stroke-primary"
                                            />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                        {repositoryCursor && (
                            <button
                                type="button"
                                className="btn btn-neutral btn-sm self-start"
                                disabled={loadingMoreRepositories}
                                onClick={() =>
                                    void loadRepositories(
                                        repositoryCursor,
                                        true,
                                    )
                                }
                            >
                                {loadingMoreRepositories && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {t('addProject.remote.github.loadMore')}
                            </button>
                        )}
                    </>
                )}
            </div>
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
                    onClick={continueWithRepository}
                >
                    {t('common:buttons.continue')}
                </button>
            </>
        );
    } else if (step === 'destination') {
        body = (
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <span className="font-medium">
                        {t('addProject.remote.destination.repository')}
                    </span>
                    <span
                        className="min-h-12 truncate rounded-box border border-base-300 bg-base-200 px-4 py-3 font-medium text-base-content"
                        title={repositoryDisplay}
                    >
                        {repositoryDisplay}
                    </span>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex min-h-6 items-center justify-between gap-4">
                        <span className="font-medium">
                            {t('addProject.remote.destination.cloneTo')}
                        </span>
                        {showUseDefaultPath && (
                            <button
                                type="button"
                                data-testid="btnUseDefaultRemoteProjectPath"
                                className="btn btn-ghost btn-xs h-6 min-h-6 px-2 text-xs text-primary"
                                onClick={() =>
                                    setParentDirectory(defaultParentDirectory)
                                }
                            >
                                {t('addProject.remote.destination.useDefault')}
                            </button>
                        )}
                    </div>
                    <label className="input z-10 w-full min-w-0 focus-within:outline-none">
                        <input
                            data-testid="inputRemoteProjectPath"
                            className="w-full min-w-0 outline-none"
                            type="text"
                            value={parentDirectory}
                            title={destinationDisplay}
                            onChange={(event) =>
                                setParentDirectory(event.target.value)
                            }
                        />
                        <span
                            data-testid="remoteProjectPathSuffix"
                            className="max-w-45 whitespace-nowrap text-base-content/50 select-none"
                        >
                            {pathSuffixDisplay}
                        </span>
                        <button
                            type="button"
                            data-testid="btnSelectRemoteProjectFolder"
                            className="flex items-center"
                            disabled={selectingFolder}
                            aria-label={t(
                                'addProject.remote.destination.chooseParent',
                            )}
                            onClick={() => void chooseParentDirectory()}
                        >
                            <FolderOpen
                                aria-hidden="true"
                                className="h-5 w-5 fill-base-content hover:fill-primary hover:stroke-primary"
                            />
                        </button>
                    </label>
                </div>
            </div>
        );
        footer = (
            <div className="flex w-full items-center justify-between gap-4">
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setStep('source')}
                >
                    {t('common:buttons.back')}
                </button>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={close}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!parentDirectory.trim() || !directoryName}
                        onClick={() => void startImport()}
                    >
                        {t('addProject.remote.actions.clone')}
                    </button>
                </div>
            </div>
        );
    } else if (step === 'importing') {
        body = (
            <div className="flex flex-col gap-4" role="status">
                <p>
                    {t(
                        `addProject.remote.progress.${getProgressKey(progress)}`,
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
                className="btn btn-warning"
                onClick={() => void cancelImport()}
            >
                {t('addProject.remote.actions.cancelImport')}
            </button>
        ) : null;
    } else if (step === 'review') {
        body = (
            <div className="flex h-full min-h-0 flex-col gap-4">
                <div>
                    <p className="font-medium">
                        {t('addProject.remote.review.title')}
                    </p>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.review.description')}
                    </p>
                </div>
                <code className="break-all rounded-box bg-base-200 p-3 text-sm">
                    {repositoryPath}
                </code>
                {discoveredProjects.length === 0 ? (
                    <div
                        className="alert alert-warning alert-soft"
                        role="status"
                    >
                        <TriangleAlert aria-hidden="true" size={18} />
                        <span>{t('addProject.remote.review.empty')}</span>
                    </div>
                ) : (
                    <div className="min-h-0 overflow-auto rounded-box border border-base-300">
                        <div className="grid grid-cols-[auto_minmax(9rem,0.7fr)_minmax(10rem,1.1fr)_minmax(8rem,0.65fr)_minmax(12rem,1fr)] items-center gap-4 border-b border-base-300 bg-base-200 px-4 py-3 font-medium">
                            <input
                                ref={selectAllRef}
                                data-testid="checkboxRemoteProjectSelectAll"
                                type="checkbox"
                                aria-label={t(
                                    'addProject.remote.review.selectAll',
                                )}
                                className="checkbox checkbox-primary checkbox-sm"
                                checked={allProjectsSelected}
                                onChange={(event) =>
                                    toggleAllProjects(event.target.checked)
                                }
                            />
                            <span>{t('table.name')}</span>
                            <span>{t('editProject.fields.path.label')}</span>
                            <span>{t('editProject.godotEditor.title')}</span>
                            <span>{t('editProject.codeEditor.title')}</span>
                        </div>
                        {discoveredProjects.map((project, index) => {
                            const checkboxId = `remote-project-${index}`;
                            return (
                                <div
                                    key={project.projectFilePath}
                                    className="grid grid-cols-[auto_minmax(9rem,0.7fr)_minmax(10rem,1.1fr)_minmax(8rem,0.65fr)_minmax(12rem,1fr)] items-center gap-4 border-b border-base-300 px-4 py-3 last:border-b-0 hover:bg-base-200"
                                >
                                    <input
                                        id={checkboxId}
                                        type="checkbox"
                                        className="checkbox checkbox-primary checkbox-sm"
                                        checked={selectedProjectPaths.has(
                                            project.projectFilePath,
                                        )}
                                        onChange={(event) =>
                                            toggleProject(
                                                project.projectFilePath,
                                                event.target.checked,
                                            )
                                        }
                                    />
                                    <label
                                        htmlFor={checkboxId}
                                        className="contents cursor-pointer"
                                    >
                                        <span className="truncate font-medium">
                                            {project.name}
                                        </span>
                                        <code className="truncate text-xs text-base-content/60">
                                            {project.relativePath}
                                        </code>
                                        <code className="truncate text-xs">
                                            {getRemoteDetectedEditorLabel(
                                                project,
                                            ) ??
                                                t(
                                                    'settings:tools.status.unknown',
                                                )}
                                        </code>
                                    </label>
                                    <SelectField
                                        id={`selectRemoteProjectCodeEditor-${index}`}
                                        testId={`selectRemoteProjectCodeEditor-${index}`}
                                        compact
                                        showSelectedCheck
                                        ariaLabel={`${project.name}: ${t('editProject.codeEditor.title')}`}
                                        value={
                                            codeEditorChoices[
                                                project.projectFilePath
                                            ] ?? 'auto'
                                        }
                                        onChange={(value) =>
                                            setProjectCodeEditorChoice(
                                                project.projectFilePath,
                                                value as RemoteProjectCodeEditorChoice,
                                            )
                                        }
                                        options={codeEditorOptions}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
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
                        onClick={close}
                    >
                        {t('addProject.remote.actions.close')}
                    </button>
                    <button
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
    } else if (step === 'registering') {
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
                {editorInstallTargets.length > 0 && (
                    <div
                        className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-200 p-4"
                        data-testid="remoteProjectEditorInstallProgress"
                    >
                        {editorInstallTargets.map((target) => {
                            const installProgress = getReleaseInstallProgress(
                                target.version,
                                target.mono,
                            );
                            const flavor = target.mono
                                ? t('installEditor:table.dotnet')
                                : t('installEditor:table.gdscript');
                            return (
                                <div
                                    key={target.projectPath}
                                    className="flex flex-col gap-2"
                                >
                                    <span className="text-sm font-medium">
                                        {t(
                                            'installEditor:table.tooltips.installingVariant',
                                            {
                                                version: target.version,
                                                flavor,
                                            },
                                        )}
                                    </span>
                                    {installProgress ? (
                                        <ReleaseInstallProgressIndicator
                                            progress={installProgress}
                                        />
                                    ) : (
                                        <div className="flex flex-col gap-1 text-xs text-info">
                                            <span>
                                                {t(
                                                    'installEditor:progress.preparing',
                                                )}
                                            </span>
                                            <progress className="progress progress-info h-1 w-full" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
        footer = null;
    } else if (step === 'registration-complete') {
        body = (
            <div className="flex h-full min-h-0 flex-col gap-4">
                <div>
                    <p className="font-medium">
                        {t('addProject.remote.registration.complete')}
                    </p>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.registration.preserved')}
                    </p>
                </div>
                <div className="min-h-0 overflow-auto rounded-box border border-base-300">
                    {registrationOutcomes.map((outcome) => (
                        <div
                            key={outcome.project.projectFilePath}
                            className="flex items-start gap-3 border-b border-base-300 px-4 py-3 last:border-b-0"
                        >
                            {outcome.status === 'added' ? (
                                <Check className="mt-0.5 h-5 w-5 shrink-0 stroke-success" />
                            ) : outcome.status === 'skipped' ? (
                                <CircleMinus className="mt-0.5 h-5 w-5 shrink-0 stroke-warning" />
                            ) : (
                                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 stroke-error" />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">
                                    {outcome.project.name}
                                </span>
                                <code className="block truncate text-xs text-base-content/60">
                                    {outcome.project.relativePath}
                                </code>
                                <span className="text-sm text-base-content/70">
                                    {t(
                                        `addProject.remote.registration.${outcome.status}`,
                                    )}
                                    {outcome.error ? `: ${outcome.error}` : ''}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
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
        );
    } else {
        body = (
            <div className="flex flex-col gap-4">
                <div
                    className={`alert ${clonePreservedPath ? 'alert-warning' : 'alert-error'} alert-soft`}
                    role="alert"
                >
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{importFailure ? t(importFailure) : ''}</span>
                </div>
                {clonePreservedPath && (
                    <p>{t('addProject.remote.registration.preserved')}</p>
                )}
                <code className="break-all rounded-box bg-base-200 p-3">
                    {clonePreservedPath ?? destinationDisplay}
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
                        type="button"
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
        >
            {body}
        </Dialog>
    );
};
