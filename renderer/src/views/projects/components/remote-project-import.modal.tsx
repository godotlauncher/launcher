import type {
    AddProjectToListResult,
    ListConnectedRepositoriesResult,
    PublicGitSourceInspectionResult,
    RemoteProjectImportProgress,
    RemoteProjectImportRequest,
    RemoteRepositorySummary,
} from '@shared/contracts';
import {
    Check,
    FolderOpen,
    GitBranch,
    GitPullRequest,
    TriangleAlert,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appBridge, projectsBridge, subscribeAppEvent } from '../../../bridge';
import { Dialog } from '../../../components/dialog.component';
import { SearchField } from '../../../components/ui/searchField.component';
import { usePreferences } from '../../../hooks/usePreferences';
import { useProjects } from '../../../hooks/useProjects';
import { appRoutePaths } from '../../../routes';
import { getProjectPathSuffixDisplay } from '../../subViews/createProject/createProject.model';
import {
    appendRemoteRepositories,
    filterRemoteRepositories,
    getRemoteImportFailureKey,
    getRemoteProjectDestinationDisplay,
    getRemoteProjectDirectoryName,
    getRemoteRepositoryRowClassName,
    shouldShowRemoteProjectUseDefault,
} from '../remote-project-import.model';

export type RemoteProjectSource = 'public-git-url' | 'github';

type RemoteProjectImportModalProps = {
    source: RemoteProjectSource | null;
    onOpenChange: (open: boolean) => void;
    handleAddProjectResult: (
        projectPath: string,
        result: AddProjectToListResult,
    ) => Promise<void>;
};

type ModalStep =
    | 'source'
    | 'destination'
    | 'importing'
    | 'import-failed'
    | 'registration-failed';

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
 * @param reason - The typed inspection failure.
 */
function getPublicSourceFailureKey(reason: PublicSourceFailure): string {
    return reason === 'dns-unavailable' ? 'dnsUnavailable' : 'invalid';
}

/**
 * Maps repository-list failures to their translation key suffix.
 *
 * @param reason - The typed repository-list failure.
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
 * @param progress - The latest progress event, when one has arrived.
 */
function getProgressKey(progress: RemoteProjectImportProgress | null): string {
    if (progress?.stage === 'cloning') {
        return 'cloning';
    }
    if (progress?.stage === 'cancelling') {
        return 'cancelling';
    }
    return 'preparing';
}

/** Renders the modal workflow for one remote Add Project source. */
export const RemoteProjectImportModal: React.FC<
    RemoteProjectImportModalProps
> = ({ source, onOpenChange, handleAddProjectResult }) => {
    const { t } = useTranslation(['projects', 'common', 'createProject']);
    const navigate = useNavigate();
    const { preferences, platform } = usePreferences();
    const { addProject } = useProjects();
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
    const [projectName, setProjectName] = useState('');
    const [selectingFolder, setSelectingFolder] = useState(false);
    const [progress, setProgress] =
        useState<RemoteProjectImportProgress | null>(null);
    const [importFailure, setImportFailure] = useState<string | null>(null);
    const [registrationFailure, setRegistrationFailure] = useState<{
        error: string;
        projectPath: string;
        projectFilePath: string;
    } | null>(null);
    const importPendingRef = useRef(false);
    const activeJobIdRef = useRef<string | null>(null);
    const publicUrlInputRef = useRef<HTMLInputElement>(null);
    const projectNameInputRef = useRef<HTMLInputElement>(null);

    const open = source !== null;
    const remoteTitle =
        source === 'github'
            ? t('addProject.remote.github.title')
            : t('addProject.remote.public.title');
    const defaultParentDirectory = preferences?.projects_location ?? '';
    const directoryName = getRemoteProjectDirectoryName(projectName);
    const destinationDisplay = getRemoteProjectDestinationDisplay(
        parentDirectory,
        directoryName,
        platform,
    );
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const pathSuffixDisplay = getProjectPathSuffixDisplay(
        parentDirectory,
        directoryName || '<project-name>',
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

    const close = useCallback(() => {
        if (step === 'importing') {
            return;
        }
        onOpenChange(false);
    }, [onOpenChange, step]);

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
        if (!open) {
            return;
        }
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
        setProjectName('');
        setProgress(null);
        setImportFailure(null);
        setRegistrationFailure(null);
        importPendingRef.current = false;
        activeJobIdRef.current = null;
        if (source === 'github') {
            void loadRepositories();
        }
    }, [defaultParentDirectory, loadRepositories, open, source]);

    useEffect(() => {
        if (!open) {
            return;
        }
        return subscribeAppEvent(
            'remote-project-import-progress',
            (nextProgress) => {
                if (!importPendingRef.current) {
                    return;
                }
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
        if (open && step === 'destination') {
            projectNameInputRef.current?.focus();
        }
    }, [open, step]);

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
            setProjectName(result.suggestedDirectoryName);
            setParentDirectory(defaultParentDirectory);
            setStep('destination');
        } catch {
            setPublicError('dns-unavailable');
        } finally {
            setInspectingPublicUrl(false);
        }
    };

    const continueWithRepository = () => {
        if (!selectedRepository || selectedRepository.alreadyImported) {
            return;
        }
        setProjectName(selectedRepository.name);
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

    const registerClonedProject = async (
        projectPath: string,
        projectFilePath: string,
    ) => {
        let addResult: AddProjectToListResult;
        try {
            addResult = await addProject(projectFilePath);
        } catch {
            setRegistrationFailure({
                error: t('addProject.remote.errors.registration-failed'),
                projectPath,
                projectFilePath,
            });
            setStep('registration-failed');
            return;
        }
        if (addResult.success || addResult.editorResolution) {
            onOpenChange(false);
            await handleAddProjectResult(projectFilePath, addResult);
            return;
        }
        setRegistrationFailure({
            error:
                addResult.error ??
                t('addProject.remote.errors.registration-failed'),
            projectPath,
            projectFilePath,
        });
        setStep('registration-failed');
    };

    const startImport = async () => {
        if (!source || !parentDirectory.trim() || !directoryName.trim()) {
            return;
        }
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
        setProgress(null);
        importPendingRef.current = true;
        activeJobIdRef.current = null;
        try {
            const result = await projectsBridge.importRemoteProject(request);
            activeJobIdRef.current = result.jobId;
            if (!result.ok) {
                setImportFailure(getRemoteImportFailureKey(result.reason));
                setStep('import-failed');
                return;
            }
            await registerClonedProject(
                result.projectPath,
                result.projectFilePath,
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
        if (!jobId || !progress?.canCancel) {
            return;
        }
        await projectsBridge.cancelRemoteProjectImport(jobId);
    };

    if (!open || !source) {
        return null;
    }

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
                                        aria-label={
                                            repository.alreadyImported
                                                ? `${repository.owner}/${repository.name} - ${t('addProject.remote.github.alreadyAdded')}`
                                                : `${repository.owner}/${repository.name}`
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
                <label className="form-control gap-2">
                    <span className="font-medium">
                        {t('addProject.remote.destination.projectName')}
                    </span>
                    <input
                        ref={projectNameInputRef}
                        data-testid="inputRemoteProjectName"
                        className="input input-bordered w-full"
                        type="text"
                        placeholder={t('createProject:project.nameplaceholder')}
                        value={projectName}
                        maxLength={255}
                        onChange={(event) => setProjectName(event.target.value)}
                    />
                    <span className="text-xs text-base-content/60">
                        {t('addProject.remote.destination.projectNameHelp')}
                    </span>
                </label>
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
                            className="input input-bordered w-full active:outline-0 outline-0"
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
                        disabled={
                            !parentDirectory.trim() || !projectName.trim()
                        }
                        onClick={() => void startImport()}
                    >
                        {t('addProject.remote.actions.cloneAndAdd')}
                    </button>
                </div>
            </div>
        );
    } else if (step === 'importing') {
        const percent = progress?.percent;
        body = (
            <div className="flex flex-col gap-4" role="status">
                <p>
                    {t(
                        `addProject.remote.progress.${getProgressKey(progress)}`,
                    )}
                </p>
                <progress
                    className="progress progress-primary w-full"
                    value={percent}
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
    } else if (step === 'registration-failed' && registrationFailure) {
        body = (
            <div className="flex flex-col gap-4">
                <div className="alert alert-warning alert-soft" role="alert">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{registrationFailure.error}</span>
                </div>
                <p>{t('addProject.remote.registration.preserved')}</p>
                <code className="break-all rounded-box bg-base-200 p-3">
                    {registrationFailure.projectPath}
                </code>
            </div>
        );
        footer = (
            <>
                <button type="button" className="btn btn-ghost" onClick={close}>
                    {t('addProject.remote.actions.close')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                        void registerClonedProject(
                            registrationFailure.projectPath,
                            registrationFailure.projectFilePath,
                        )
                    }
                >
                    {t('addProject.remote.actions.retryRegistration')}
                </button>
            </>
        );
    } else {
        body = (
            <div className="flex flex-col gap-4">
                <div className="alert alert-error alert-soft" role="alert">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{importFailure ? t(importFailure) : ''}</span>
                </div>
                <code className="break-all rounded-box bg-base-200 p-3">
                    {destinationDisplay}
                </code>
            </div>
        );
        footer = (
            <>
                <button type="button" className="btn btn-ghost" onClick={close}>
                    {t('addProject.remote.actions.close')}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep('destination')}
                >
                    {t('addProject.remote.actions.reviewAndRetry')}
                </button>
            </>
        );
    }

    return (
        <Dialog
            icon={sourceIcon}
            title={remoteTitle}
            footer={footer}
            panelClassName="h-[85vh] max-w-4xl"
        >
            {body}
        </Dialog>
    );
};
