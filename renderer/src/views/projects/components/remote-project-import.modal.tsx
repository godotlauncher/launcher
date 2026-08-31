import type {
    AddProjectOptions,
    AddProjectToListResult,
    GitIdentity,
    GitIdentityScope,
    ListConnectedRepositoriesResult,
    ProjectGitIdentityPreset,
    PublicGitSourceInspectionResult,
    RemoteDiscoveredProject,
    RemoteProjectImportProgress,
    RemoteProjectImportRequest,
    RemoteProjectSubmoduleActivity,
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
import { SearchField } from '../../../components/ui/searchField.component';
import { SelectField } from '../../../components/ui/selectField.component';
import {
    type GitIdentitySaveChoice,
    isGitIdentityComplete,
    resolveGitIdentityDecision,
    resolveGitIdentitySave,
} from '../../../git-identity.model';
import { useGit } from '../../../hooks/git.hook';
import { usePreferences } from '../../../hooks/usePreferences';
import {
    type ProjectEditorRepairRequest,
    useProjects,
} from '../../../hooks/useProjects';
import { useRelease } from '../../../hooks/useRelease';
import { appRoutePaths } from '../../../routes';
import { getProjectPathSuffixDisplay } from '../../subViews/createProject/createProject.model';
import {
    createRemoteProjectEditorPlan,
    type RemoteProjectEditorCandidate,
    type RemoteProjectEditorChoice,
    type RemoteProjectEditorPlanGroup,
} from '../remote-project-editor-plan.model';
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
    type RemoteProjectCodeEditorChoice,
    selectAllDiscoveredProjects,
    shouldShowRemoteProjectUseDefault,
} from '../remote-project-import.model';

import {
    RemoteProjectGitIdentity,
    type RemoteProjectGitIdentityPage,
} from './remote-project-git-identity.component';
export type RemoteProjectSource = 'public-git-url' | 'github';

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

type ModalStep =
    | 'source'
    | 'destination'
    | 'importing'
    | 'import-failed'
    | 'submodules'
    | 'git-identity'
    | 'initialising-submodules'
    | 'review'
    | 'cancel-review'
    | 'checking-projects'
    | 'editors-required'
    | 'registering-projects'
    | 'registration-complete';

type PostGitIdentityStep = 'submodules' | 'review';
type GitIdentityWarning = 'identity' | 'preset';

type RegistrationOutcome = {
    project: RemoteDiscoveredProject;
    status: 'added' | 'skipped' | 'failed';
    error?: string;
};

type SubmoduleActivityEntry = {
    id: number;
    activity: RemoteProjectSubmoduleActivity;
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
 * Returns one translated activity message for a safe submodule event.
 *
 * @param activity - Typed renderer-safe submodule activity.
 * @param translate - Translation function for the active locale.
 */
function getSubmoduleActivityMessage(
    activity: RemoteProjectSubmoduleActivity,
    translate: (key: string, values?: Record<string, unknown>) => string,
): string {
    const key = `addProject.remote.submodules.activity.${activity.type}`;
    if (activity.type === 'found') {
        return translate(key, { count: activity.count });
    }
    if (
        activity.type === 'validating' ||
        activity.type === 'initialising' ||
        activity.type === 'initialised'
    ) {
        return translate(key, { path: activity.path });
    }
    if (activity.type === 'complete') {
        return translate(key, { count: activity.projectCount });
    }
    if (activity.type === 'stopped') {
        return translate(key, { path: activity.path ?? '' });
    }
    return translate(key);
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

    const [gitIdentityPage, setGitIdentityPage] =
        useState<RemoteProjectGitIdentityPage>('warning');
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [gitIdentityScope, setGitIdentityScope] =
        useState<GitIdentityScope>('repository');
    const [gitIdentitySaveChoice, setGitIdentitySaveChoice] =
        useState<GitIdentitySaveChoice>('ask');
    const [gitIdentityPreset, setGitIdentityPreset] =
        useState<ProjectGitIdentityPreset | null>(null);
    const [preflightGlobalIdentity, setPreflightGlobalIdentity] =
        useState<GitIdentity>({ name: '', email: '' });
    const [postGitIdentityStep, setPostGitIdentityStep] =
        useState<PostGitIdentityStep>('review');
    const [showGitIdentityValidation, setShowGitIdentityValidation] =
        useState(false);
    const [savingGitIdentity, setSavingGitIdentity] = useState(false);
    const [gitIdentityWarning, setGitIdentityWarning] =
        useState<GitIdentityWarning | null>(null);
    const [cloneJobId, setCloneJobId] = useState<string | null>(null);
    const [cloneRecoveryAvailable, setCloneRecoveryAvailable] = useState(false);
    const [resolvingClone, setResolvingClone] = useState(false);
    const [cloneRecoveryError, setCloneRecoveryError] = useState<string | null>(
        null,
    );
    const [repositoryPath, setRepositoryPath] = useState('');
    const [submoduleActivities, setSubmoduleActivities] = useState<
        SubmoduleActivityEntry[]
    >([]);
    const [submoduleFailure, setSubmoduleFailure] = useState<string | null>(
        null,
    );
    const gitIdentityPrimaryActionRef = useRef<HTMLButtonElement>(null);
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
    const remoteProjectPathInputRef = useRef<HTMLInputElement>(null);
    const initialiseSubmodulesButtonRef = useRef<HTMLButtonElement>(null);
    const addDiscoveredProjectsButtonRef = useRef<HTMLButtonElement>(null);
    const reviewAndRetryButtonRef = useRef<HTMLButtonElement>(null);
    const applyEditorPlanButtonRef = useRef<HTMLButtonElement>(null);
    const completionDoneButtonRef = useRef<HTMLButtonElement>(null);
    const cancelReviewBackButtonRef = useRef<HTMLButtonElement>(null);
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
        if (
            step === 'importing' ||
            step === 'initialising-submodules' ||
            step === 'checking-projects' ||
            step === 'registering-projects' ||
            savingGitIdentity
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
        savingGitIdentity,
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
        setGitIdentityPage('warning');
        setGitIdentityName('');
        setGitIdentityEmail('');
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setGitIdentityPreset(null);
        setPreflightGlobalIdentity({ name: '', email: '' });
        setPostGitIdentityStep('review');
        setShowGitIdentityValidation(false);
        setSavingGitIdentity(false);
        setGitIdentityWarning(null);
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

    /**
     * Writes identity only through the process-owned clone capability.
     *
     * @param jobId - Completed remote import job.
     * @param identity - Complete repository identity.
     * @returns Whether the repository identity was configured.
     */
    const applyRepositoryGitIdentity = async (
        jobId: string,
        identity: GitIdentity,
    ): Promise<boolean> => {
        try {
            const result = await projectsBridge.setRemoteProjectGitIdentity(
                jobId,
                { name: identity.name, email: identity.email },
            );
            return result.status === 'configured';
        } catch {
            return false;
        }
    };

    /** Continues to the post-clone step selected before identity resolution. */
    const continueAfterGitIdentity = () => {
        setSavingGitIdentity(false);
        setStep(postGitIdentityStep);
    };

    /**
     * Resolves inherited, preset, and missing identity after a successful clone.
     *
     * @param jobId - Completed remote import job.
     * @param nextStep - Submodule or project review destination.
     */
    const prepareGitIdentity = async (
        jobId: string,
        nextStep: PostGitIdentityStep,
    ) => {
        setPostGitIdentityStep(nextStep);
        setGitIdentityWarning(null);
        let settings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: null as ProjectGitIdentityPreset | null,
        };
        try {
            settings = await getIdentitySettings();
        } catch {
            // An unreadable configuration is treated as missing.
        }

        const decision = resolveGitIdentityDecision(
            settings.globalIdentity,
            settings.projectPreset,
        );
        if (decision.action === 'use-global') {
            setStep(nextStep);
            return;
        }
        if (decision.action === 'apply-preset') {
            const configured = await applyRepositoryGitIdentity(
                jobId,
                decision.preset,
            );
            if (!configured) {
                setGitIdentityWarning('identity');
            }
            setStep(nextStep);
            return;
        }

        setPreflightGlobalIdentity(decision.globalIdentity);
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setShowGitIdentityValidation(false);
        if (decision.action === 'suggest-preset') {
            setGitIdentityPreset(decision.preset);
            setGitIdentityName(decision.preset.name);
            setGitIdentityEmail(decision.preset.email);
            setGitIdentityPage('preset');
        } else {
            setGitIdentityPreset(null);
            setGitIdentityName(decision.globalIdentity.name);
            setGitIdentityEmail(decision.globalIdentity.email);
            setGitIdentityPage('warning');
        }
        setStep('git-identity');
    };

    /** Opens the editable identity form from the missing-identity warning. */
    const addGitIdentity = () => {
        setGitIdentityName(preflightGlobalIdentity.name);
        setGitIdentityEmail(preflightGlobalIdentity.email);
        setGitIdentityScope('repository');
        setShowGitIdentityValidation(false);
        setGitIdentityPage('identity');
    };

    /** Opens the editable form instead of using the suggested preset. */
    const useDifferentGitIdentity = () => {
        setGitIdentityName(preflightGlobalIdentity.name);
        setGitIdentityEmail(preflightGlobalIdentity.email);
        setGitIdentityScope('repository');
        setShowGitIdentityValidation(false);
        setGitIdentityPage('identity');
    };

    /** Applies the suggested preset locally and continues the import. */
    const applyGitIdentityPreset = async () => {
        if (!cloneJobId || !gitIdentityPreset) {
            setGitIdentityWarning('identity');
            continueAfterGitIdentity();
            return;
        }
        setSavingGitIdentity(true);
        const configured = await applyRepositoryGitIdentity(
            cloneJobId,
            gitIdentityPreset,
        );
        if (!configured) {
            setGitIdentityWarning('identity');
        }
        continueAfterGitIdentity();
    };

    /** Validates and saves the entered identity before continuing import. */
    const saveGitIdentityAndContinue = async () => {
        const identity = {
            name: gitIdentityName.trim(),
            email: gitIdentityEmail.trim(),
        };
        if (!isGitIdentityComplete(identity)) {
            setShowGitIdentityValidation(true);
            return;
        }

        const resolution = gitIdentityPreset
            ? { scope: gitIdentityScope, preset: null }
            : resolveGitIdentitySave(
                  identity,
                  gitIdentitySaveChoice,
                  gitIdentityPreset,
              );
        if (!resolution) {
            setShowGitIdentityValidation(true);
            return;
        }

        setSavingGitIdentity(true);
        let warning: GitIdentityWarning | null = null;
        if (resolution.scope === 'global') {
            try {
                const result = await saveGlobalIdentity(identity);
                if (!result.success) {
                    warning = 'identity';
                }
            } catch {
                warning = 'identity';
            }
        } else if (
            !cloneJobId ||
            !(await applyRepositoryGitIdentity(cloneJobId, identity))
        ) {
            warning = 'identity';
        }

        if (resolution.preset) {
            try {
                const result = await saveProjectIdentityPreset(
                    resolution.preset,
                );
                if (!result.success && !warning) {
                    warning = 'preset';
                }
            } catch {
                if (!warning) {
                    warning = 'preset';
                }
            }
        }
        setGitIdentityWarning(warning);
        continueAfterGitIdentity();
    };

    /** Returns the editable form to its warning or preset choice. */
    const returnFromGitIdentityForm = () => {
        setShowGitIdentityValidation(false);
        setGitIdentityPage(gitIdentityPreset ? 'preset' : 'warning');
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
            await prepareGitIdentity(
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
        const knownNames = new Set(projects.map((project) => project.name));
        const knownPaths = new Set(
            projects.map((project) =>
                normaliseProjectPath(project.path, platform),
            ),
        );
        const outcomes: RegistrationOutcome[] = [];
        const editorCandidates: RemoteProjectEditorCandidate[] = [];

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
                    const options = getRemoteAddProjectOptions(
                        codeEditorChoices[project.projectFilePath] ?? 'auto',
                    );
                    const result = await addProject(
                        project.projectFilePath,
                        options,
                    );

                    if (result.editorResolution) {
                        editorCandidates.push({ project, result, options });
                        knownNames.add(project.name);
                        knownPaths.add(normalisedDirectory);
                        continue;
                    }

                    if (result.success) {
                        await handleAddProjectResult(
                            project.projectFilePath,
                            result,
                            options,
                        );
                        outcome = {
                            project,
                            status: 'added',
                        };
                        knownNames.add(project.name);
                        knownPaths.add(normalisedDirectory);
                    } else {
                        outcome = {
                            project,
                            status: 'failed',
                            error:
                                result.error ??
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
            preserveRegisteredClone();
        }

        const plan = createRemoteProjectEditorPlan(
            editorCandidates,
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
        let processedProjects = 0;
        setRegistrationProgress({ current: 0, total: projectCount });
        setStep('registering-projects');
        const resolvedOutcomes: RegistrationOutcome[] = [];
        const repairRequests: ProjectEditorRepairRequest[] = [];

        for (const group of editorPlan) {
            const registeredProjects: ProjectEditorRepairRequest['projects'] =
                [];
            for (const candidate of group.candidates) {
                const resolutionOptions: AddProjectOptions =
                    group.choice === 'use-fallback' && group.fallback
                        ? {
                              ...candidate.options,
                              resolution: 'use_fallback',
                              release: group.fallback,
                          }
                        : {
                              ...candidate.options,
                              resolution: 'add_missing',
                          };
                try {
                    const result = await addProject(
                        candidate.project.projectFilePath,
                        resolutionOptions,
                    );
                    if (result.success && result.newProject) {
                        await handleAddProjectResult(
                            candidate.project.projectFilePath,
                            result,
                            resolutionOptions,
                        );
                        registeredProjects.push(result.newProject);
                        resolvedOutcomes.push({
                            project: candidate.project,
                            status: 'added',
                        });
                    } else {
                        resolvedOutcomes.push({
                            project: candidate.project,
                            status: 'failed',
                            error:
                                result.error ??
                                t(
                                    'addProject.remote.errors.registration-failed',
                                ),
                        });
                    }
                } catch {
                    resolvedOutcomes.push({
                        project: candidate.project,
                        status: 'failed',
                        error: t(
                            'addProject.remote.errors.registration-failed',
                        ),
                    });
                }
                processedProjects += 1;
                setRegistrationProgress({
                    current: processedProjects,
                    total: projectCount,
                });
            }

            if (
                group.choice === 'download' &&
                group.downloadableRelease &&
                registeredProjects.length > 0
            ) {
                repairRequests.push({
                    release: group.downloadableRelease,
                    mono: group.mono,
                    projects: registeredProjects,
                });
            }
        }

        setRegistrationOutcomes((current) => [...current, ...resolvedOutcomes]);
        if (resolvedOutcomes.some((outcome) => outcome.status === 'added')) {
            preserveRegisteredClone();
        }
        queueProjectEditorRepairs(repairRequests);
        setEditorDownloadsQueued(repairRequests.length > 0);
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
    const submoduleActivityFeed = submoduleActivities.length > 0 && (
        <div className="flex min-h-0 flex-col gap-2">
            <p className="font-medium">
                {t('addProject.remote.submodules.activityTitle')}
            </p>
            <ol
                className="max-h-64 space-y-2 overflow-auto rounded-box border border-base-300 bg-base-200 p-3 text-sm"
                aria-live="polite"
                aria-label={t('addProject.remote.submodules.activityAriaLabel')}
            >
                {submoduleActivities.map((entry) => (
                    <li key={entry.id} className="break-all font-mono">
                        {getSubmoduleActivityMessage(entry.activity, t)}
                    </li>
                ))}
            </ol>
        </div>
    );

    /** Renders the grouped Godot editor requirements and resolution choices. */
    const renderEditorPlanTable = (): React.ReactNode => (
        <div
            className="min-h-0 overflow-auto rounded-box border border-base-300"
            data-testid="remoteProjectEditorPlan"
        >
            <div className="grid grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_minmax(12rem,0.8fr)_minmax(14rem,1fr)] items-center gap-4 border-b border-base-300 bg-base-200 px-4 py-3 font-medium">
                <span>{t('editProject.godotEditor.title')}</span>
                <span>
                    {t('addProject.remote.editorBatch.affectedProjects')}
                </span>
                <span>{t('addProject.remote.editorBatch.resolution')}</span>
                <span>{t('addProject.remote.editorBatch.status')}</span>
            </div>
            {editorPlan.map((group, index) => {
                const flavor = group.mono
                    ? t('installEditor:table.dotnet')
                    : t('installEditor:table.gdscript');
                const choiceOptions = [
                    ...(group.downloadableRelease
                        ? [
                              {
                                  value: 'download',
                                  label: t(
                                      'addProject.editorResolution.download',
                                      { version: group.version },
                                  ),
                              },
                          ]
                        : []),
                    ...(group.fallback
                        ? [
                              {
                                  value: 'use-fallback',
                                  label: t(
                                      'addProject.editorResolution.useFallback',
                                      { version: group.fallback.version },
                                  ),
                              },
                          ]
                        : []),
                    {
                        value: 'add-missing',
                        label: t('addProject.editorResolution.addMissing'),
                    },
                ];

                return (
                    <div
                        key={group.key}
                        className="grid grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_minmax(12rem,0.8fr)_minmax(14rem,1fr)] items-center gap-4 border-b border-base-300 px-4 py-4 last:border-b-0"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">
                                {group.version}
                            </span>
                            <span className="badge badge-outline badge-sm shrink-0">
                                {flavor}
                            </span>
                        </div>
                        <ul className="min-w-0 space-y-1 text-sm">
                            {group.candidates.map(({ project }) => (
                                <li
                                    key={project.projectFilePath}
                                    className="truncate"
                                    title={project.name}
                                >
                                    {project.name}
                                </li>
                            ))}
                        </ul>
                        <SelectField
                            id={`selectRemoteProjectEditorResolution-${index}`}
                            testId={`selectRemoteProjectEditorResolution-${index}`}
                            compact
                            showSelectedCheck
                            ariaLabel={`${group.version}: ${t('addProject.remote.editorBatch.resolution')}`}
                            value={group.choice}
                            onChange={(value) =>
                                setEditorPlanChoice(
                                    group.key,
                                    value as RemoteProjectEditorChoice,
                                )
                            }
                            options={choiceOptions}
                        />
                        <div className="min-w-0">
                            <span className="text-sm text-base-content/70">
                                {t(
                                    'addProject.remote.editorBatch.statuses.ready',
                                )}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
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
                        onKeyDown={(event) => {
                            if (
                                event.key !== 'Enter' ||
                                event.repeat ||
                                event.nativeEvent.isComposing
                            )
                                return;
                            event.preventDefault();
                            if (!publicUrl.trim() || inspectingPublicUrl)
                                return;
                            void inspectPublicSource();
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
                        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 overflow-auto">
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
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter') return;
                                            event.preventDefault();
                                            continueWithRepository(repository);
                                        }}
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
                    onClick={() => continueWithRepository(selectedRepository)}
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
                    <label className="input z-10 w-full min-w-0">
                        <input
                            ref={remoteProjectPathInputRef}
                            data-testid="inputRemoteProjectPath"
                            className="w-full min-w-0"
                            type="text"
                            value={parentDirectory}
                            title={destinationDisplay}
                            onChange={(event) =>
                                setParentDirectory(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (
                                    event.key !== 'Enter' ||
                                    event.repeat ||
                                    event.nativeEvent.isComposing
                                )
                                    return;
                                event.preventDefault();
                                void startImport();
                            }}
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
                className="btn btn-ghost"
                onClick={() => void cancelImport()}
            >
                {t('addProject.remote.actions.cancelImport')}
            </button>
        ) : null;
    } else if (step === 'git-identity') {
        body = (
            <RemoteProjectGitIdentity
                page={gitIdentityPage}
                name={gitIdentityName}
                email={gitIdentityEmail}
                scope={gitIdentityScope}
                saveChoice={gitIdentitySaveChoice}
                preset={gitIdentityPreset}
                globalIdentityComplete={isGitIdentityComplete(
                    preflightGlobalIdentity,
                )}
                showValidation={showGitIdentityValidation}
                saving={savingGitIdentity}
                primaryActionRef={gitIdentityPrimaryActionRef}
                t={t}
                onNameChange={setGitIdentityName}
                onEmailChange={setGitIdentityEmail}
                onScopeChange={setGitIdentityScope}
                onSaveChoiceChange={setGitIdentitySaveChoice}
                onContinueWithoutIdentity={continueAfterGitIdentity}
                onAddIdentity={addGitIdentity}
                onUseGlobal={continueAfterGitIdentity}
                onUseDifferentIdentity={useDifferentGitIdentity}
                onUsePreset={() => void applyGitIdentityPreset()}
                onBack={returnFromGitIdentityForm}
                onSave={() => void saveGitIdentityAndContinue()}
            />
        );
        footer = null;
    } else if (step === 'submodules' || step === 'initialising-submodules') {
        const initialising = step === 'initialising-submodules';
        body = (
            <div className="flex h-full min-h-0 flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-semibold">
                        {t('addProject.remote.submodules.title')}
                    </h2>
                    <p className="max-w-4xl text-sm text-base-content/70">
                        {t('addProject.remote.submodules.description')}
                    </p>
                </div>
                {submoduleFailure && (
                    <div className="alert alert-error alert-soft" role="alert">
                        <TriangleAlert aria-hidden="true" size={18} />
                        <span>{t('addProject.remote.submodules.failure')}</span>
                    </div>
                )}
                {initialising && submoduleActivities.length === 0 && (
                    <div className="flex items-center gap-2" role="status">
                        <span className="loading loading-spinner loading-sm" />
                        {t('addProject.remote.submodules.preparing')}
                    </div>
                )}
                {submoduleActivityFeed}
            </div>
        );
        footer = initialising ? (
            progress?.canCancel ? (
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void cancelImport()}
                >
                    {t('addProject.remote.actions.cancelImport')}
                </button>
            ) : null
        ) : (
            <div className="flex w-full items-center justify-between gap-4">
                <button
                    type="button"
                    data-testid="btnContinueWithoutSubmodules"
                    className="btn btn-ghost"
                    onClick={() => setStep('review')}
                >
                    {t(
                        'addProject.remote.submodules.continueWithoutSubmodules',
                    )}
                </button>
                <button
                    ref={initialiseSubmodulesButtonRef}
                    type="button"
                    data-testid="btnInitialiseSubmodules"
                    className="btn btn-primary"
                    onClick={() => void initialiseSubmodules()}
                >
                    {t('addProject.remote.submodules.initialise')}
                </button>
            </div>
        );
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
        const projectCount = editorPlan.reduce(
            (count, group) => count + group.candidates.length,
            0,
        );
        const downloadCount = editorPlan.filter(
            (group) => group.choice === 'download',
        ).length;
        body = (
            <div className="flex h-full min-h-0 flex-col gap-4">
                <div>
                    <p className="font-medium">
                        {t('addProject.remote.editorBatch.title')}
                    </p>
                    <p className="text-sm text-base-content/70">
                        {t('addProject.remote.editorBatch.description', {
                            count: projectCount,
                        })}
                    </p>
                </div>
                <code className="break-all rounded-box bg-base-200 p-3 text-sm">
                    {repositoryPath}
                </code>
                <p className="text-sm font-medium">
                    {t('addProject.remote.editorBatch.summary', {
                        editors: editorPlan.length,
                        projects: projectCount,
                    })}
                </p>
                {renderEditorPlanTable()}
            </div>
        );
        footer = (
            <div className="flex w-full items-center justify-between gap-4">
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={finishWithoutRemainingProjects}
                >
                    {t('addProject.remote.editorBatch.finishWithoutRemaining')}
                </button>
                <button
                    ref={applyEditorPlanButtonRef}
                    type="button"
                    data-testid="btnApplyRemoteProjectEditorPlan"
                    className="btn btn-primary"
                    onClick={() => void applyEditorPlan()}
                >
                    {t('addProject.remote.editorBatch.apply', {
                        projects: projectCount,
                        editors: downloadCount,
                    })}
                </button>
            </div>
        );
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
                {editorDownloadsQueued && (
                    <div className="alert alert-info alert-soft">
                        <Check aria-hidden="true" size={18} />
                        <span>
                            {t('addProject.remote.registration.editorsQueued')}
                        </span>
                    </div>
                )}
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
            {gitIdentityWarning && (
                <div
                    className="alert alert-warning alert-soft mb-4"
                    role="status"
                >
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>
                        {t(
                            gitIdentityWarning === 'preset'
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
