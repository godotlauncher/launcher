import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
    CreateProjectPublicationOutcome,
    CreateProjectPublicationTarget,
    GitIdentityScope,
    GitLfsTrackingPolicyDescriptor,
    ProjectDetails,
    ProjectGitIdentityPreset,
    PublishedGitHubRepository,
    RendererType,
    ToolIntegrationSummary,
} from '@shared/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { appBridge } from '../../bridge.ts';
import { BusyOverlay } from '../../components/busy-overlay.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { WaitingForDialogOverlay } from '../../components/waitingForDialogOverlay.component';
import { useGit } from '../../hooks/git.hook';
import { useGitLfs } from '../../hooks/git-lfs.hook';
import { useAlerts } from '../../hooks/useAlerts';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useCodeEditorIntegrations } from '../../hooks/useCodeEditorIntegrations';
import { useFileSystem } from '../../hooks/useFileSystem';
import { usePreferences } from '../../hooks/usePreferences';
import { useProjects } from '../../hooks/useProjects';
import { useRelease } from '../../hooks/useRelease';
import { useToolIntegrations } from '../../hooks/useToolIntegrations';
import { appRoutePaths } from '../../routes';
import {
    CreateProjectGitIdentityDialog,
    type GitIdentityDialogPage,
} from './createProject/components/create-project-git-identity-dialog.component';
import { CreateProjectGitHubPublishingRecoveryDialog } from './createProject/components/create-project-github-publishing-recovery-dialog.component';
import { CreateProjectGitHubPublishingSection } from './createProject/components/create-project-github-publishing-section.component';
import { CreateProjectSourceControlSection } from './createProject/components/create-project-source-control-section.component';
import { CreateProjectActions } from './createProject/components/createProjectActions.component';
import { CreateProjectProjectSection } from './createProject/components/createProjectProjectSection.component';
import { CreateProjectRendererSection } from './createProject/components/createProjectRendererSection.component';
import { CreateProjectToolOptionsSection } from './createProject/components/createProjectToolOptionsSection.component';
import type { RepositoryNameAvailabilityState } from './createProject/components/repository-creation-fields.component';
import {
    addCreateProjectGitLfsOptions,
    buildCreateProjectReleaseRows,
    type CreateProjectGitIdentitySaveChoice,
    getCreateProjectDirectorySegment,
    getCreateProjectReleaseKey,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    getPublicationTargetValue,
    getSuggestedGitHubRepositoryName,
    isCreateProjectNameAvailable,
    isGitHubRepositoryNameValid,
    isGitIdentityComplete,
    isToolIntegrationAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    OVERWRITE_PATH_CHECK_DEBOUNCE_MS,
    PROJECT_NAME_CHECK_DEBOUNCE_MS,
    REPOSITORY_NAME_CHECK_DEBOUNCE_MS,
    resolveCreateProjectCodeEditorId,
    resolveCreateProjectGitIdentityDecision,
    resolveCreateProjectGitIdentitySave,
    resolveCreateProjectReleaseIndex,
    toCreateProjectPublicationOptions,
} from './createProject/createProject.model';

type FailedPublication = Extract<
    CreateProjectPublicationOutcome,
    { status: 'failed' }
>;

type SubViewProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Renders the Create Project workflow.
 *
 * @param props - Drawer visibility and change callback.
 * @returns The Create Project drawer.
 */
export const CreateProjectDrawer: React.FC<SubViewProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation([
        'createProject',
        'projects',
        'common',
        'installEditor',
    ]);
    const createButtonRef = useRef<HTMLButtonElement>(null);
    const [renderer, setRenderer] = useState<RendererType[5]>('FORWARD_PLUS');
    const [releaseKey, setReleaseKey] = useState<string | null>(null);
    const [projectName, setProjectName] = useState<string>('');
    const [projectNameAvailability, setProjectNameAvailability] = useState<
        'idle' | 'checking' | 'available' | 'unavailable'
    >('idle');
    const [overwriteBasePath, setOverwriteBasePath] = useState<string>('');
    const [overwriteBasePathMissing, setOverwriteBasePathMissing] =
        useState<boolean>(false);
    const [checkingOverwriteBasePath, setCheckingOverwriteBasePath] =
        useState<boolean>(false);
    const [editNow, setEditNow] = useState<boolean>(true);
    const [error, setError] = useState<string | undefined>();
    const [creating, setCreating] = useState<boolean>(false);
    const [checkingGitIdentity, setCheckingGitIdentity] =
        useState<boolean>(false);
    const [gitIdentityDialogPage, setGitIdentityDialogPage] =
        useState<GitIdentityDialogPage | null>(null);
    const [gitIdentityName, setGitIdentityName] = useState('');
    const [gitIdentityEmail, setGitIdentityEmail] = useState('');
    const [gitIdentityScope, setGitIdentityScope] =
        useState<GitIdentityScope>('repository');
    const [showGitIdentityValidation, setShowGitIdentityValidation] =
        useState(false);
    const [gitIdentitySaveChoice, setGitIdentitySaveChoice] =
        useState<CreateProjectGitIdentitySaveChoice>('ask');
    const [savingGitIdentityPreset, setSavingGitIdentityPreset] =
        useState(false);
    const [gitIdentitySaveError, setGitIdentitySaveError] = useState<
        string | null
    >(null);
    const [suggestedGitIdentityPreset, setSuggestedGitIdentityPreset] =
        useState<ProjectGitIdentityPreset | null>(null);
    const [preflightGlobalIdentity, setPreflightGlobalIdentity] = useState({
        name: '',
        email: '',
    });
    const [selectingFolder, setSelectingFolder] = useState<boolean>(false);
    const [tools, setTools] = useState<ToolIntegrationSummary[]>([]);
    const [overwriteProjectPath, setOverwriteProjectPath] =
        useState<boolean>(false);
    const [withGit, setWithGit] = useState<boolean>(true);
    const [withGitLfs, setWithGitLfs] = useState<boolean>(false);
    const [gitLfsPolicy, setGitLfsPolicy] =
        useState<GitLfsTrackingPolicyDescriptor | null>(null);
    const [loadingGitLfsPolicy, setLoadingGitLfsPolicy] =
        useState<boolean>(true);
    const [codeEditorId, setCodeEditorId] = useState<CodeEditorId | null>(null);
    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const [codeEditorSettings, setCodeEditorSettings] = useState<
        CodeEditorIntegrationSettings[]
    >([]);
    const [loadingCodeEditors, setLoadingCodeEditors] = useState<boolean>(true);
    const [codeEditorLoadFailed, setCodeEditorLoadFailed] = useState(false);
    const [publishToGitHub, setPublishToGitHub] = useState(false);
    const [publicationTargets, setPublicationTargets] = useState<
        CreateProjectPublicationTarget[]
    >([]);
    const [publicationTargetsLoading, setPublicationTargetsLoading] =
        useState(false);
    const [publicationTargetFailure, setPublicationTargetFailure] = useState<
        | 'connection-required'
        | 'permission-update-required'
        | 'secure-storage-unavailable'
        | 'provider-unavailable'
        | null
    >(null);
    const [selectedPublicationTarget, setSelectedPublicationTarget] =
        useState('');
    const [repositoryName, setRepositoryName] = useState('');
    const [repositoryNameEdited, setRepositoryNameEdited] = useState(false);
    const [repositoryNameAvailability, setRepositoryNameAvailability] =
        useState<RepositoryNameAvailabilityState>('idle');
    const [publicationFailure, setPublicationFailure] =
        useState<FailedPublication | null>(null);
    const [publicationProject, setPublicationProject] =
        useState<ProjectDetails | null>(null);
    const inputNameRef = useRef<HTMLInputElement>(null);
    const projectNameCheckRequestRef = useRef<number>(0);
    const overwritePathCheckRequestRef = useRef<number>(0);
    const repositoryNameCheckRequestRef = useRef<number>(0);
    const overwriteBasePathInitializedRef = useRef<boolean>(false);
    const defaultOverwriteBasePathRef = useRef('');

    const { installedReleases, downloadingReleases } = useRelease();
    const { addAlert, addCustomConfirm } = useAlerts();
    const {
        projects,
        createProject,
        launchProject,
        listCreateProjectPublicationTargets,
        checkCreateProjectRepositoryNameAvailability,
        retryCreateProjectPublication,
        discardCreateProjectPublication,
    } = useProjects();
    const { openExternalLink } = useAppNavigation();
    const navigate = useNavigate();
    const { pathExists } = useFileSystem();
    const { getIdentitySettings, saveProjectIdentityPreset } = useGit();
    const { getTrackingPolicy: getGitLfsTrackingPolicy } = useGitLfs();
    const { listIntegrationSettings } = useCodeEditorIntegrations();
    const { listIntegrations } = useToolIntegrations();
    const { preferences, platform } = usePreferences();
    const pathSeparator = platform === 'win32' ? '\\' : '/';
    const defaultOverwriteBasePath = preferences?.projects_location ?? '';
    const projectDirectorySegment = useMemo(
        () => getCreateProjectDirectorySegment(projectName),
        [projectName],
    );

    useEffect(() => {
        projectNameCheckRequestRef.current += 1;
        const requestId = projectNameCheckRequestRef.current;
        if (!open || projectName.trim().length === 0) {
            setProjectNameAvailability('idle');
            return;
        }

        setProjectNameAvailability('checking');
        const timeoutId = window.setTimeout(() => {
            if (projectNameCheckRequestRef.current !== requestId) {
                return;
            }
            setProjectNameAvailability(
                isCreateProjectNameAvailable(projects, projectName)
                    ? 'available'
                    : 'unavailable',
            );
        }, PROJECT_NAME_CHECK_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [open, projectName, projects]);

    useEffect(() => {
        if (!repositoryNameEdited) {
            setRepositoryName(getSuggestedGitHubRepositoryName(projectName));
        }
    }, [projectName, repositoryNameEdited]);

    useEffect(() => {
        repositoryNameCheckRequestRef.current += 1;
        const requestId = repositoryNameCheckRequestRef.current;
        const target = publicationTargets.find(
            (candidate) =>
                getPublicationTargetValue(candidate) ===
                selectedPublicationTarget,
        );
        if (
            !open ||
            !publishToGitHub ||
            !target ||
            !isGitHubRepositoryNameValid(repositoryName) ||
            (publicationFailure !== null && !publicationFailure.canEdit)
        ) {
            setRepositoryNameAvailability('idle');
            return;
        }

        setRepositoryNameAvailability('checking');
        const timeoutId = window.setTimeout(() => {
            checkCreateProjectRepositoryNameAvailability(
                toCreateProjectPublicationOptions(target, repositoryName),
            )
                .then((result) => {
                    if (repositoryNameCheckRequestRef.current === requestId) {
                        setRepositoryNameAvailability(result.status);
                    }
                })
                .catch(() => {
                    if (repositoryNameCheckRequestRef.current === requestId) {
                        setRepositoryNameAvailability('unknown');
                    }
                });
        }, REPOSITORY_NAME_CHECK_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [
        checkCreateProjectRepositoryNameAvailability,
        open,
        publicationFailure,
        publicationTargets,
        publishToGitHub,
        repositoryName,
        selectedPublicationTarget,
    ]);

    const allReleases = useMemo(
        () =>
            buildCreateProjectReleaseRows(
                installedReleases,
                downloadingReleases,
            ),
        [installedReleases, downloadingReleases],
    );
    const validInstalledReleaseCount = useMemo(
        () =>
            installedReleases.filter((release) => release.valid !== false)
                .length,
        [installedReleases],
    );
    const selectedReleaseIndex = resolveCreateProjectReleaseIndex(
        allReleases,
        releaseKey,
    );
    const selectedRelease = allReleases[selectedReleaseIndex];

    useEffect(() => {
        if (!selectedRelease) {
            return;
        }

        const resolvedReleaseKey = getCreateProjectReleaseKey(selectedRelease);
        if (resolvedReleaseKey !== releaseKey) {
            setReleaseKey(resolvedReleaseKey);
        }
    }, [releaseKey, selectedRelease]);

    const derivedProjectPath = useMemo(() => {
        const basePath = preferences?.projects_location || '';
        const segment = projectName
            ? projectDirectorySegment
            : '<project-name>';
        if (platform === 'win32') {
            return `${basePath}\\${segment}`;
        }
        return `${basePath}/${segment}`;
    }, [preferences, platform, projectDirectorySegment, projectName]);

    const projectSegmentDisplay = useMemo(
        () => (projectName ? projectDirectorySegment : '<project-name>'),
        [projectDirectorySegment, projectName],
    );

    const overwriteDisplayPath = useMemo(
        () =>
            joinBasePathWithProjectSegment(
                overwriteBasePath,
                projectSegmentDisplay,
                pathSeparator,
            ),
        [overwriteBasePath, projectSegmentDisplay, pathSeparator],
    );

    const overwriteSubmitPath = useMemo(
        () =>
            joinBasePathWithProjectSegment(
                overwriteBasePath,
                projectDirectorySegment,
                pathSeparator,
            ),
        [overwriteBasePath, pathSeparator, projectDirectorySegment],
    );

    const overwritePathSuffixDisplay = useMemo(
        () =>
            getProjectPathSuffixDisplay(
                overwriteBasePath,
                projectSegmentDisplay,
                pathSeparator,
            ),
        [overwriteBasePath, projectSegmentDisplay, pathSeparator],
    );

    const showFolderCreateIcon =
        overwriteProjectPath &&
        !checkingOverwriteBasePath &&
        overwriteBasePathMissing;
    const isOverwritePathEmpty =
        overwriteProjectPath && overwriteBasePath.trim().length === 0;
    const isOverwritePathChangedFromDefault =
        overwriteProjectPath &&
        normalizeBasePathForJoin(overwriteBasePath, pathSeparator) !==
            normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator);
    const showUseDefaultPathAction =
        overwriteProjectPath &&
        normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator)
            .length > 0 &&
        (isOverwritePathEmpty || isOverwritePathChangedFromDefault);

    /** Shows publication success with a safe external repository action. */
    const showPublishedAlert = (repository: PublishedGitHubRepository) => {
        addAlert(
            t('publishToGitHub.successTitle'),
            <div className="flex flex-col items-start gap-2">
                <p>
                    {t('publishToGitHub.successMessage', {
                        owner: repository.owner,
                        name: repository.name,
                    })}
                </p>
                <button
                    type="button"
                    className="btn btn-link h-auto min-h-0 p-0"
                    onClick={() => void openExternalLink(repository.webUrl)}
                >
                    {t('publishToGitHub.openGitHub')}
                </button>
            </div>,
        );
    };

    useEffect(() => {
        defaultOverwriteBasePathRef.current =
            preferences?.projects_location ?? '';

        if (!open) {
            return;
        }

        if (
            !overwriteBasePathInitializedRef.current &&
            preferences?.projects_location
        ) {
            setOverwriteBasePath(preferences.projects_location);
            overwriteBasePathInitializedRef.current = true;
        }
    }, [open, preferences?.projects_location]);

    useEffect(() => {
        if (!open) {
            return;
        }

        if (!overwriteProjectPath) {
            overwritePathCheckRequestRef.current += 1;
            setCheckingOverwriteBasePath(false);
            setOverwriteBasePathMissing(false);
            return;
        }

        const pathToCheck = overwriteBasePath.trim();
        if (pathToCheck.length === 0) {
            overwritePathCheckRequestRef.current += 1;
            setCheckingOverwriteBasePath(false);
            setOverwriteBasePathMissing(true);
            return;
        }

        const requestId = overwritePathCheckRequestRef.current + 1;
        overwritePathCheckRequestRef.current = requestId;
        setCheckingOverwriteBasePath(true);

        const timeoutId = window.setTimeout(() => {
            pathExists(pathToCheck)
                .then((exists) => {
                    if (overwritePathCheckRequestRef.current !== requestId) {
                        return;
                    }

                    setOverwriteBasePathMissing(!exists);
                })
                .catch(() => {
                    if (overwritePathCheckRequestRef.current !== requestId) {
                        return;
                    }

                    setOverwriteBasePathMissing(true);
                })
                .finally(() => {
                    if (overwritePathCheckRequestRef.current === requestId) {
                        setCheckingOverwriteBasePath(false);
                    }
                });
        }, OVERWRITE_PATH_CHECK_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [open, overwriteBasePath, overwriteProjectPath, pathExists]);

    /**
     * Creates the selected project with an optional Git setup choice.
     *
     * @param gitOptions - Optional initial commit, identity, and Git LFS setup choice.
     * @returns A promise that resolves after creation handling completes.
     */
    const createSelectedProject = async (
        gitOptions?: CreateProjectGitOptions,
    ) => {
        setCreating(true);
        const publicationTarget = publicationTargets.find(
            (target) =>
                getPublicationTargetValue(target) === selectedPublicationTarget,
        );
        const result = await createProject(
            projectName,
            allReleases[selectedReleaseIndex],
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath ? overwriteSubmitPath : undefined,
            addCreateProjectGitLfsOptions(
                gitOptions,
                withGitLfs ? gitLfsPolicy?.id : undefined,
            ),
            publishToGitHub && publicationTarget
                ? toCreateProjectPublicationOptions(
                      publicationTarget,
                      repositoryName,
                  )
                : undefined,
        );

        setCreating(false);

        if (result.success && result.projectDetails) {
            if (result.gitSetup?.status === 'existing-repository') {
                addAlert(
                    t(
                        'projects:editProject.sourceControl.existingRepositoryTitle',
                    ),
                    result.gitSetup.isProjectRoot
                        ? t(
                              'projects:editProject.sourceControl.existingRepositoryRoot',
                          )
                        : t(
                              'projects:editProject.sourceControl.existingRepositoryParent',
                              { root: result.gitSetup.root },
                          ),
                );
            }
            onOpenChange(false);
            if (editNow) {
                launchProject(result.projectDetails);
            }
            if (result.publication?.status === 'published') {
                showPublishedAlert(result.publication.repository);
            }
        } else if (
            result.projectDetails &&
            result.publication?.status === 'failed'
        ) {
            setPublicationProject(result.projectDetails);
            setPublicationFailure(result.publication);
            if (
                result.publication.reason ===
                'repository-name-unavailable-or-policy-rejected'
            ) {
                setRepositoryNameAvailability('unavailable');
            }
            setError(undefined);
        } else {
            setError(result.error);
        }
    };

    /** Loads fresh connected GitHub owners when publishing is enabled. */
    const loadPublicationTargets = async () => {
        setPublicationTargetsLoading(true);
        setPublicationTargetFailure(null);
        try {
            const result = await listCreateProjectPublicationTargets();
            if (!result.success) {
                setPublicationTargets([]);
                setSelectedPublicationTarget('');
                setPublicationTargetFailure(result.reason);
                return;
            }

            setPublicationTargets(result.targets);
            setSelectedPublicationTarget(
                result.targets.length === 1
                    ? getPublicationTargetValue(result.targets[0])
                    : '',
            );
        } catch {
            setPublicationTargets([]);
            setSelectedPublicationTarget('');
            setPublicationTargetFailure('provider-unavailable');
        } finally {
            setPublicationTargetsLoading(false);
        }
    };

    /** Enables or clears the progressive GitHub publishing section. */
    const handlePublishToGitHubChange = (enabled: boolean) => {
        setPublishToGitHub(enabled);
        setPublicationFailure(null);
        setPublicationProject(null);
        setRepositoryNameAvailability('idle');
        if (enabled) {
            void loadPublicationTargets();
            return;
        }

        setPublicationTargets([]);
        setPublicationTargetFailure(null);
        setSelectedPublicationTarget('');
    };

    /** Retries the exact failed publication attempt without recreating local work. */
    const handleRetryPublication = async () => {
        if (!publicationFailure) return;

        if (
            publicationFailure.canEdit &&
            ((repositoryNameAvailability !== 'available' &&
                repositoryNameAvailability !== 'unknown') ||
                !selectedPublicationTarget ||
                !isGitHubRepositoryNameValid(repositoryName))
        ) {
            return;
        }

        const target = publicationTargets.find(
            (candidate) =>
                getPublicationTargetValue(candidate) ===
                selectedPublicationTarget,
        );
        setCreating(true);
        try {
            const result = await retryCreateProjectPublication(
                publicationFailure.attemptId,
                publicationFailure.canEdit && target
                    ? toCreateProjectPublicationOptions(target, repositoryName)
                    : undefined,
                publicationFailure.recoveryAction,
            );
            if (result.publication?.status === 'published') {
                setPublicationFailure(null);
                onOpenChange(false);
                if (editNow && result.projectDetails) {
                    void launchProject(result.projectDetails);
                }
                showPublishedAlert(result.publication.repository);
                return;
            }
            if (result.publication?.status === 'failed') {
                setPublicationFailure(result.publication);
                if (
                    result.publication.reason ===
                    'repository-name-unavailable-or-policy-rejected'
                ) {
                    setRepositoryNameAvailability('unavailable');
                }
            }
        } catch {
            setError(t('publishToGitHub.retryFailed'));
        } finally {
            setCreating(false);
        }
    };

    /** Keeps the local project and forgets the failed remote attempt. */
    const handleContinueLocally = async () => {
        if (!publicationFailure) return;
        await discardCreateProjectPublication(publicationFailure.attemptId);
        setPublicationFailure(null);
        onOpenChange(false);
        if (editNow && publicationProject) {
            void launchProject(publicationProject);
        }
        addAlert(
            t('publishToGitHub.localTitle'),
            t('publishToGitHub.localMessage'),
        );
    };

    /** Opens the confirmed or intended GitHub repository in the system browser. */
    const handleOpenPublicationRepository = () => {
        const repository =
            publicationFailure?.repository ??
            publicationFailure?.intendedRepository;
        if (repository) {
            void openExternalLink(repository.webUrl);
        }
    };

    /** Warns that leaving the drawer clears its unsaved form values. */
    const handleOpenConnections = () => {
        addCustomConfirm(
            t('publishToGitHub.leaveTitle'),
            t('publishToGitHub.leaveMessage'),
            [
                {
                    typeClass: 'btn-primary',
                    text: t('publishToGitHub.openConnections'),
                    onClick: () => {
                        onOpenChange(false);
                        navigate(appRoutePaths.settingsTab('connections'));
                        return true;
                    },
                },
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: t('common:buttons.cancel'),
                },
            ],
        );
    };

    /**
     * Validates the form and checks Git identity before project creation.
     *
     * @returns A promise that resolves after preflight or creation completes.
     */
    const onCreateProject = async () => {
        setError(undefined);

        if (
            publishToGitHub &&
            (!selectedPublicationTarget ||
                !isGitHubRepositoryNameValid(repositoryName) ||
                (repositoryNameAvailability !== 'available' &&
                    repositoryNameAvailability !== 'unknown'))
        ) {
            return;
        }

        if (projectName.trim() === '') {
            setError(t('project.nameRequired'));
            return;
        }

        if (!isCreateProjectNameAvailable(projects, projectName)) {
            return;
        }

        if (!withGit || !gitAvailable) {
            await createSelectedProject();
            return;
        }

        setCheckingGitIdentity(true);
        let identitySettings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: null as ProjectGitIdentityPreset | null,
        };
        try {
            identitySettings = await getIdentitySettings();
        } catch {
            identitySettings = {
                globalIdentity: { name: '', email: '' },
                projectPreset: null,
            };
        } finally {
            setCheckingGitIdentity(false);
        }

        const decision = resolveCreateProjectGitIdentityDecision(
            identitySettings.globalIdentity,
            identitySettings.projectPreset,
        );
        if (decision.action === 'use-global') {
            await createSelectedProject();
            return;
        }
        if (decision.action === 'apply-preset') {
            await createSelectedProject({
                initialCommit: 'create',
                identity: {
                    name: decision.preset.name,
                    email: decision.preset.email,
                    scope: 'repository',
                },
            });
            return;
        }
        if (decision.action === 'suggest-preset') {
            setSuggestedGitIdentityPreset(decision.preset);
            setPreflightGlobalIdentity(decision.globalIdentity);
            setGitIdentityName(decision.preset.name);
            setGitIdentityEmail(decision.preset.email);
            setGitIdentityScope('repository');
            setShowGitIdentityValidation(false);
            setGitIdentitySaveError(null);
            setGitIdentityDialogPage('preset');
            return;
        }

        setSuggestedGitIdentityPreset(null);
        setPreflightGlobalIdentity(decision.globalIdentity);
        setGitIdentityName(decision.globalIdentity.name);
        setGitIdentityEmail(decision.globalIdentity.email);
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setShowGitIdentityValidation(false);
        setGitIdentitySaveError(null);
        setGitIdentityDialogPage('warning');
    };

    /** Initializes the project repository without staging or committing. */
    const handleSkipInitialCommit = () => {
        setGitIdentityDialogPage(null);
        void createSelectedProject({ initialCommit: 'skip' });
    };

    /**
     * Validates and submits the entered Git identity and selected default.
     *
     * @returns A promise that resolves after preset and project handling.
     */
    const handleSaveGitIdentity = async () => {
        const identity = {
            name: gitIdentityName.trim(),
            email: gitIdentityEmail.trim(),
        };
        if (!isGitIdentityComplete(identity)) {
            setShowGitIdentityValidation(true);
            return;
        }

        let scope = gitIdentityScope;
        if (!suggestedGitIdentityPreset) {
            const resolution = resolveCreateProjectGitIdentitySave(
                identity,
                gitIdentitySaveChoice,
                suggestedGitIdentityPreset,
            );
            if (!resolution) {
                setGitIdentitySaveError(t('errors.failedGitIdentity'));
                return;
            }
            scope = resolution.scope;

            if (resolution.preset) {
                setSavingGitIdentityPreset(true);
                setGitIdentitySaveError(null);
                try {
                    const result = await saveProjectIdentityPreset(
                        resolution.preset,
                    );
                    if (!result.success) {
                        setGitIdentitySaveError(t('errors.failedGitIdentity'));
                        return;
                    }
                } catch {
                    setGitIdentitySaveError(t('errors.failedGitIdentity'));
                    return;
                } finally {
                    setSavingGitIdentityPreset(false);
                }
            }
        }

        setGitIdentityDialogPage(null);
        await createSelectedProject({
            initialCommit: 'create',
            identity: { ...identity, scope },
        });
    };

    /** Uses the complete global identity without writing repository settings. */
    const handleUseGlobalGitIdentity = () => {
        setGitIdentityDialogPage(null);
        void createSelectedProject();
    };

    /** Opens the existing identity form with the partial global values. */
    const handleUseDifferentGitIdentity = () => {
        setGitIdentityName(preflightGlobalIdentity.name);
        setGitIdentityEmail(preflightGlobalIdentity.email);
        setGitIdentityScope('repository');
        setGitIdentitySaveError(null);
        setShowGitIdentityValidation(false);
        setGitIdentityDialogPage('identity');
    };

    /** Returns to the warning or suggested preset that opened the form. */
    const handleGitIdentityBack = () => {
        setShowGitIdentityValidation(false);
        setGitIdentitySaveError(null);
        if (suggestedGitIdentityPreset) {
            setGitIdentityName(suggestedGitIdentityPreset.name);
            setGitIdentityEmail(suggestedGitIdentityPreset.email);
            setGitIdentityScope('repository');
            setGitIdentityDialogPage('preset');
            return;
        }
        setGitIdentityDialogPage('warning');
    };

    /**
     * Selects a Godot editor without depending on its current sorted index.
     *
     * @param nextReleaseKey - Stable version and variant identity to select.
     */
    const changeRelease = (nextReleaseKey: string) => {
        const release = allReleases.find(
            (candidate) =>
                getCreateProjectReleaseKey(candidate) === nextReleaseKey,
        );

        if (!release) {
            return;
        }

        setReleaseKey(nextReleaseKey);

        const defaultRenderer = getDefaultRendererForReleaseVersion(
            release.version,
        );

        if (defaultRenderer) {
            setRenderer(defaultRenderer);
        }
    };

    const gitAvailable = isToolIntegrationAvailable(tools, 'git');
    const gitLfsAvailable =
        isToolIntegrationAvailable(tools, 'git-lfs') && gitLfsPolicy !== null;

    useEffect(() => {
        if (!open) {
            return;
        }

        let active = true;
        listIntegrations()
            .then((integrations) => {
                if (active) {
                    setTools(integrations);
                }
            })
            .catch(() => {
                if (active) {
                    setTools([]);
                }
            })
            .finally(() => {
                if (active) {
                    setLoadingTools(false);
                }
            });

        return () => {
            active = false;
        };
    }, [listIntegrations, open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let active = true;

        getGitLfsTrackingPolicy()
            .then((policy) => {
                if (active) {
                    setGitLfsPolicy(policy);
                }
            })
            .catch(() => {
                if (active) {
                    setGitLfsPolicy(null);
                }
            })
            .finally(() => {
                if (active) {
                    setLoadingGitLfsPolicy(false);
                }
            });

        return () => {
            active = false;
        };
    }, [getGitLfsTrackingPolicy, open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let active = true;

        listIntegrationSettings()
            .then((settings) => {
                if (active) {
                    setCodeEditorSettings(settings);
                }
            })
            .catch(() => {
                if (active) {
                    setCodeEditorSettings([]);
                    setCodeEditorId(null);
                    setCodeEditorLoadFailed(true);
                }
            })
            .finally(() => {
                if (active) {
                    setLoadingCodeEditors(false);
                }
            });

        return () => {
            active = false;
        };
    }, [listIntegrationSettings, open]);

    useEffect(() => {
        if (loadingTools || loadingCodeEditors) return;

        setWithGit(gitAvailable);
        setCodeEditorId(resolveCreateProjectCodeEditorId(codeEditorSettings));
    }, [codeEditorSettings, gitAvailable, loadingCodeEditors, loadingTools]);

    useEffect(() => {
        if (!withGit || !gitLfsAvailable) {
            setWithGitLfs(false);
        }
        if (!withGit) {
            setPublishToGitHub(false);
            setPublicationTargets([]);
            setPublicationTargetFailure(null);
            setSelectedPublicationTarget('');
        }
    }, [gitLfsAvailable, withGit]);

    const handleSelectProjectFolder = async () => {
        setSelectingFolder(true);
        try {
            const browsePath =
                overwriteBasePath || preferences?.projects_location || '';
            const selectFolderResult = await appBridge.openDirectoryDialog(
                browsePath,
                t('project.selectFolderDialogTitle'),
                [],
            );

            if (
                selectFolderResult &&
                !selectFolderResult.canceled &&
                selectFolderResult.filePaths.length > 0
            ) {
                setOverwriteBasePath(selectFolderResult.filePaths[0]);
            }
        } finally {
            setSelectingFolder(false);
        }
    };

    useEffect(() => {
        if (!open) {
            return;
        }

        setRenderer('FORWARD_PLUS');
        setReleaseKey(null);
        setProjectName('');
        setProjectNameAvailability('idle');
        setOverwriteBasePath(defaultOverwriteBasePathRef.current);
        setOverwriteBasePathMissing(false);
        setCheckingOverwriteBasePath(false);
        setEditNow(true);
        setError(undefined);
        setCreating(false);
        setCheckingGitIdentity(false);
        setGitIdentityDialogPage(null);
        setGitIdentityName('');
        setGitIdentityEmail('');
        setGitIdentityScope('repository');
        setGitIdentitySaveChoice('ask');
        setShowGitIdentityValidation(false);
        setSavingGitIdentityPreset(false);
        setGitIdentitySaveError(null);
        setSuggestedGitIdentityPreset(null);
        setPreflightGlobalIdentity({ name: '', email: '' });
        setSelectingFolder(false);
        setTools([]);
        setOverwriteProjectPath(false);
        setWithGit(true);
        setWithGitLfs(false);
        setGitLfsPolicy(null);
        setLoadingGitLfsPolicy(true);
        setCodeEditorId(null);
        setLoadingTools(true);
        setCodeEditorSettings([]);
        setLoadingCodeEditors(true);
        setCodeEditorLoadFailed(false);
        setPublishToGitHub(false);
        setPublicationTargets([]);
        setPublicationTargetsLoading(false);
        setPublicationTargetFailure(null);
        setSelectedPublicationTarget('');
        setRepositoryName('');
        setRepositoryNameEdited(false);
        setRepositoryNameAvailability('idle');
        setPublicationFailure(null);
        setPublicationProject(null);
        overwritePathCheckRequestRef.current += 1;
        repositoryNameCheckRequestRef.current += 1;
        overwriteBasePathInitializedRef.current = Boolean(
            defaultOverwriteBasePathRef.current,
        );
    }, [open]);

    const closeDisabled =
        creating ||
        checkingGitIdentity ||
        savingGitIdentityPreset ||
        selectingFolder ||
        gitIdentityDialogPage !== null ||
        publicationFailure !== null;

    return (
        <>
            <Drawer
                open={open}
                onOpenChange={onOpenChange}
                side="right"
                closeOnBackdrop={!closeDisabled}
                closeOnEscape={!closeDisabled}
                trapFocus={
                    gitIdentityDialogPage === null &&
                    publicationFailure === null
                }
                initialFocusRef={inputNameRef}
                width="min(680px, 100vw)"
                panelClassName={
                    gitIdentityDialogPage
                        ? 'max-w-[100vw] border-l-0'
                        : 'max-w-[100vw]'
                }
            >
                {selectingFolder && (
                    <WaitingForDialogOverlay
                        className="z-60"
                        message={t('projects:messages.waitingForDialog')}
                    />
                )}
                {creating && !publicationFailure && (
                    <BusyOverlay
                        className="z-60"
                        message={t(
                            publishToGitHub
                                ? 'buttons.publishing'
                                : 'buttons.creating',
                        )}
                    />
                )}
                <Drawer.Header>
                    <Drawer.Title>{t('title')}</Drawer.Title>
                    <Drawer.CloseButton
                        data-testid="btnCloseCreateProject"
                        disabled={closeDisabled}
                    />
                </Drawer.Header>
                <form className="flex min-h-0 flex-1 flex-col">
                    <Drawer.Body className="flex flex-col gap-5 pt-2">
                        {error && (
                            <div
                                className="alert alert-error alert-soft"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}
                        <CreateProjectProjectSection
                            t={t}
                            releases={allReleases}
                            releaseKey={
                                selectedRelease
                                    ? getCreateProjectReleaseKey(
                                          selectedRelease,
                                      )
                                    : ''
                            }
                            inputNameRef={inputNameRef}
                            installedReleaseCount={validInstalledReleaseCount}
                            projectName={projectName}
                            projectNameError={
                                projectNameAvailability === 'unavailable'
                                    ? t('project.nameExists')
                                    : undefined
                            }
                            derivedProjectPath={derivedProjectPath}
                            overwriteProjectPath={overwriteProjectPath}
                            overwriteBasePath={overwriteBasePath}
                            overwriteDisplayPath={overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                overwritePathSuffixDisplay
                            }
                            showUseDefaultPathAction={showUseDefaultPathAction}
                            showFolderCreateIcon={showFolderCreateIcon}
                            isOverwritePathEmpty={isOverwritePathEmpty}
                            onProjectNameChange={setProjectName}
                            onReleaseChange={changeRelease}
                            onOverwriteBasePathChange={setOverwriteBasePath}
                            onUseDefaultPath={() =>
                                setOverwriteBasePath(defaultOverwriteBasePath)
                            }
                            onSelectProjectFolder={() =>
                                void handleSelectProjectFolder()
                            }
                            onOverwriteProjectPathChange={
                                setOverwriteProjectPath
                            }
                        />
                        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                            <div className="flex flex-col gap-5">
                                <CreateProjectRendererSection
                                    t={t}
                                    renderer={renderer}
                                    versionNumber={
                                        allReleases[selectedReleaseIndex]
                                            ?.version_number || 0
                                    }
                                    onRendererChange={setRenderer}
                                />
                                <CreateProjectToolOptionsSection
                                    t={t}
                                    loadingCodeEditors={loadingCodeEditors}
                                    codeEditorLoadFailed={codeEditorLoadFailed}
                                    codeEditorSettings={codeEditorSettings}
                                    codeEditorId={codeEditorId}
                                    onCodeEditorIdChange={setCodeEditorId}
                                />
                            </div>
                            <div className="flex flex-col gap-5">
                                <CreateProjectSourceControlSection
                                    t={t}
                                    loading={
                                        loadingTools || loadingGitLfsPolicy
                                    }
                                    gitAvailable={gitAvailable}
                                    gitLfsAvailable={gitLfsAvailable}
                                    gitLfsPolicy={gitLfsPolicy}
                                    withGit={withGit}
                                    withGitLfs={withGitLfs}
                                    publishToGitHub={publishToGitHub}
                                    publishingLocked={
                                        publicationFailure !== null
                                    }
                                    onWithGitChange={setWithGit}
                                    onWithGitLfsChange={setWithGitLfs}
                                    onPublishToGitHubChange={
                                        handlePublishToGitHubChange
                                    }
                                />
                            </div>
                        </div>
                        <CreateProjectGitHubPublishingSection
                            t={t}
                            enabled={publishToGitHub}
                            loading={publicationTargetsLoading}
                            targets={publicationTargets}
                            targetFailure={publicationTargetFailure}
                            selectedTargetValue={selectedPublicationTarget}
                            repositoryName={repositoryName}
                            availability={repositoryNameAvailability}
                            repositoryNameError={
                                publishToGitHub &&
                                repositoryName.length > 0 &&
                                !isGitHubRepositoryNameValid(repositoryName)
                                    ? t('publishToGitHub.repositoryNameInvalid')
                                    : undefined
                            }
                            disabled={!withGit || !gitAvailable}
                            onTargetChange={setSelectedPublicationTarget}
                            onRepositoryNameChange={(name) => {
                                setRepositoryNameEdited(true);
                                setRepositoryName(name);
                            }}
                            onOpenConnections={handleOpenConnections}
                        />
                    </Drawer.Body>
                    <Drawer.Footer className="justify-between">
                        <CreateProjectActions
                            editNow={editNow}
                            creating={creating || checkingGitIdentity}
                            createDisabled={
                                loadingTools ||
                                loadingGitLfsPolicy ||
                                validInstalledReleaseCount < 1 ||
                                selectedReleaseIndex < 0 ||
                                projectNameAvailability === 'checking' ||
                                projectNameAvailability === 'unavailable' ||
                                isOverwritePathEmpty ||
                                publicationFailure !== null ||
                                (publishToGitHub &&
                                    (publicationTargetsLoading ||
                                        publicationTargetFailure !== null ||
                                        !selectedPublicationTarget ||
                                        !isGitHubRepositoryNameValid(
                                            repositoryName,
                                        ) ||
                                        (repositoryNameAvailability !==
                                            'available' &&
                                            repositoryNameAvailability !==
                                                'unknown')))
                            }
                            editNowLabel={t('buttons.editNow')}
                            cancelLabel={t('common:buttons.cancel')}
                            createLabel={t(
                                publishToGitHub
                                    ? 'buttons.createAndPublish'
                                    : 'buttons.create',
                            )}
                            onEditNowChange={setEditNow}
                            onCancel={() => onOpenChange(false)}
                            onCreateProject={() => void onCreateProject()}
                            createButtonRef={createButtonRef}
                        />
                    </Drawer.Footer>
                </form>
            </Drawer>
            {publicationFailure && (
                <CreateProjectGitHubPublishingRecoveryDialog
                    t={t}
                    failure={publicationFailure}
                    targets={publicationTargets}
                    selectedTargetValue={selectedPublicationTarget}
                    repositoryName={repositoryName}
                    availability={repositoryNameAvailability}
                    repositoryNameError={
                        repositoryName.length > 0 &&
                        !isGitHubRepositoryNameValid(repositoryName)
                            ? t('publishToGitHub.repositoryNameInvalid')
                            : undefined
                    }
                    busy={creating}
                    retryDisabled={
                        publicationFailure.canEdit &&
                        (!selectedPublicationTarget ||
                            !isGitHubRepositoryNameValid(repositoryName) ||
                            (repositoryNameAvailability !== 'available' &&
                                repositoryNameAvailability !== 'unknown'))
                    }
                    returnFocusRef={createButtonRef}
                    onTargetChange={setSelectedPublicationTarget}
                    onRepositoryNameChange={(name) => {
                        setRepositoryNameEdited(true);
                        setRepositoryName(name);
                    }}
                    onRetry={() => void handleRetryPublication()}
                    onContinueLocally={() => void handleContinueLocally()}
                    onOpenGitHub={handleOpenPublicationRepository}
                />
            )}
            {gitIdentityDialogPage && (
                <CreateProjectGitIdentityDialog
                    page={gitIdentityDialogPage}
                    name={gitIdentityName}
                    email={gitIdentityEmail}
                    scope={gitIdentityScope}
                    showValidation={showGitIdentityValidation}
                    globalIdentityComplete={isGitIdentityComplete(
                        preflightGlobalIdentity,
                    )}
                    showDefaultChoices={!suggestedGitIdentityPreset}
                    saveChoice={gitIdentitySaveChoice}
                    saving={savingGitIdentityPreset}
                    saveError={gitIdentitySaveError}
                    allowSkip={!publishToGitHub}
                    t={t}
                    onNameChange={(name) => {
                        setGitIdentityName(name);
                        setGitIdentitySaveError(null);
                    }}
                    onEmailChange={(email) => {
                        setGitIdentityEmail(email);
                        setGitIdentitySaveError(null);
                    }}
                    onScopeChange={(scope) => {
                        setGitIdentityScope(scope);
                        setGitIdentitySaveError(null);
                    }}
                    onSaveChoiceChange={(choice) => {
                        setGitIdentitySaveChoice(choice);
                        setGitIdentitySaveError(null);
                    }}
                    onSkip={handleSkipInitialCommit}
                    onAddIdentity={() => setGitIdentityDialogPage('identity')}
                    onUseGlobal={handleUseGlobalGitIdentity}
                    onUseDifferentIdentity={handleUseDifferentGitIdentity}
                    onBack={handleGitIdentityBack}
                    onSave={() => void handleSaveGitIdentity()}
                    onRequestClose={() => setGitIdentityDialogPage(null)}
                    returnFocusRef={createButtonRef}
                />
            )}
        </>
    );
};
