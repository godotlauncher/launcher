import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CreateProjectGitOptions,
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
import { CreateProjectDestinationStatus } from './createProject/components/create-project-destination-status.component';
import { CreateProjectEditorPicker } from './createProject/components/create-project-editor-picker.component';
import {
    CreateProjectExistingRepositoryDialog,
    type ExistingRepositoryConsequences,
} from './createProject/components/create-project-existing-repository-dialog.component';
import {
    CreateProjectGitIdentityDialog,
    type GitIdentityDialogPage,
} from './createProject/components/create-project-git-identity-dialog.component';
import { CreateProjectGitHubPublishingRecoveryDialog } from './createProject/components/create-project-github-publishing-recovery-dialog.component';
import { CreateProjectGitHubPublishingSection } from './createProject/components/create-project-github-publishing-section.component';
import {
    CreateProjectProgressOverlay,
    type CreateProjectProgressPhase,
} from './createProject/components/create-project-progress-overlay.component';
import { CreateProjectSourceControlSection } from './createProject/components/create-project-source-control-section.component';
import { CreateProjectActions } from './createProject/components/createProjectActions.component';
import { CreateProjectProjectSection } from './createProject/components/createProjectProjectSection.component';
import { CreateProjectRendererSection } from './createProject/components/createProjectRendererSection.component';
import { CreateProjectToolOptionsSection } from './createProject/components/createProjectToolOptionsSection.component';
import type { RepositoryNameAvailabilityState } from './createProject/components/repository-creation-fields.component';
import type {
    CreateProjectDrawerProps,
    CreateProjectSubmission,
    ExistingRepositoryDialogState,
    FailedPublication,
} from './createProject/create-project-workflow.types';
import {
    addCreateProjectGitLfsOptions,
    buildCreateProjectReleaseRows,
    type CreateProjectEditorSelection,
    type CreateProjectGitIdentitySaveChoice,
    getCreateProjectCatalogueVariants,
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
    prepareCreateProjectRelease,
    REPOSITORY_NAME_CHECK_DEBOUNCE_MS,
    resolveCreateProjectCodeEditorId,
    resolveCreateProjectGitIdentityDecision,
    resolveCreateProjectGitIdentitySave,
    shouldShowCreateProjectPublishedAlert,
    toCreateProjectPublicationOptions,
} from './createProject/createProject.model';
import { useCreateProjectDestination } from './createProject/use-create-project-destination.hook';

/**
 * Renders the Create Project workflow.
 *
 * @param props - Drawer visibility and change callback.
 * @returns The Create Project drawer.
 */
export const CreateProjectDrawer: React.FC<CreateProjectDrawerProps> = ({
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
    const [editorSelection, setEditorSelection] =
        useState<CreateProjectEditorSelection | null>(null);
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
    const [progressPhase, setProgressPhase] =
        useState<CreateProjectProgressPhase | null>(null);
    const [checkingGitIdentity, setCheckingGitIdentity] =
        useState<boolean>(false);
    const [checkingProjectRepository, setCheckingProjectRepository] =
        useState<boolean>(false);
    const [existingRepositoryDialog, setExistingRepositoryDialog] =
        useState<ExistingRepositoryDialogState | null>(null);
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
    const pendingSubmissionRef = useRef<CreateProjectSubmission | null>(null);

    const {
        installedReleases,
        availableReleases,
        availablePrereleases,
        releaseInstallProgress,
        loading: loadingReleases,
        installRelease,
        cancelInstall,
    } = useRelease();
    const { addAlert, addCustomConfirm } = useAlerts();
    const {
        projects,
        createProject,
        launchProject,
        listCreateProjectPublicationTargets,
        checkCreateProjectRepositoryNameAvailability,
        inspectCreateProjectRepository,
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
    const selectedEditorInstalled =
        editorSelection?.source === 'installed' ||
        Boolean(
            editorSelection?.source === 'catalogue' &&
                editorSelection.installedRelease,
        );
    const selectedEditorInstallProgress =
        editorSelection?.source === 'catalogue'
            ? releaseInstallProgress.find(
                  (progress) =>
                      progress.version === editorSelection.release.version &&
                      progress.mono === editorSelection.mono,
              )
            : undefined;

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

    useEffect(() => {
        if (!open || editorSelection) {
            return;
        }

        const installedRelease = buildCreateProjectReleaseRows(
            installedReleases,
            [],
        ).find(
            (release) =>
                release.valid !== false && Boolean(release.editor_path),
        );
        if (installedRelease) {
            setEditorSelection({
                source: 'installed',
                key: getCreateProjectReleaseKey(installedRelease),
                release: installedRelease,
            });
            return;
        }

        const catalogueVariant =
            getCreateProjectCatalogueVariants(availableReleases, '')[0] ??
            getCreateProjectCatalogueVariants(availablePrereleases, '')[0];
        if (catalogueVariant) {
            setEditorSelection({
                source: 'catalogue',
                key: catalogueVariant.key,
                release: catalogueVariant.release,
                mono: catalogueVariant.mono,
            });
        }
    }, [
        availablePrereleases,
        availableReleases,
        editorSelection,
        installedReleases,
        open,
    ]);

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
        !checkingOverwriteBasePath && overwriteBasePathMissing;
    const isOverwritePathEmpty = overwriteBasePath.trim().length === 0;
    const destinationCheck = useCreateProjectDestination(
        open && !isOverwritePathEmpty,
        projectName,
        overwriteSubmitPath,
        t('destination.checkFailed'),
    );
    const isOverwritePathChangedFromDefault =
        normalizeBasePathForJoin(overwriteBasePath, pathSeparator) !==
        normalizeBasePathForJoin(defaultOverwriteBasePath, pathSeparator);
    const showUseDefaultPathAction =
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
    }, [open, overwriteBasePath, pathExists]);

    /** Clears the blocking workflow and returns to the preserved form. */
    const finishCreateProjectProgress = () => {
        setCreating(false);
        setProgressPhase(null);
    };

    /**
     * Reports a workflow failure in the application alert dialog.
     *
     * @param message - User-facing failure detail.
     */
    const showCreateProjectError = (message: string) => {
        finishCreateProjectProgress();
        setError(undefined);
        addAlert(t('common:error'), message);
    };

    /**
     * Creates the selected project with an optional Git setup choice.
     *
     * @param submission - Immutable values captured for this Create submission.
     * @param gitOptions - Optional initial commit and identity choice.
     * @param existingRepository - Confirmed parent repository and skipped option summary.
     * @returns A promise that resolves after creation handling completes.
     */
    const createSelectedProject = async (
        submission: CreateProjectSubmission,
        gitOptions?: CreateProjectGitOptions,
        existingRepository?: {
            root: string;
            consequences: ExistingRepositoryConsequences;
        },
    ) => {
        const requiresEditorInstall =
            submission.editorSelection.source === 'catalogue' &&
            !submission.editorSelection.installedRelease;
        setCreating(true);
        setProgressPhase(requiresEditorInstall ? 'installing' : 'creating');

        let preparedRelease: Awaited<
            ReturnType<typeof prepareCreateProjectRelease>
        >;
        try {
            preparedRelease = await prepareCreateProjectRelease(
                submission.editorSelection,
                installRelease,
            );
        } catch (installError) {
            showCreateProjectError(
                installError instanceof Error
                    ? installError.message
                    : t('editorPicker.installFailed'),
            );
            return;
        }

        if (!preparedRelease.success || !preparedRelease.release) {
            showCreateProjectError(
                preparedRelease.error ?? t('editorPicker.installFailed'),
            );
            return;
        }

        setProgressPhase('creating');

        const preparedSubmission: CreateProjectSubmission =
            submission.editorSelection.source === 'catalogue'
                ? {
                      ...submission,
                      editorSelection: {
                          ...submission.editorSelection,
                          installedRelease: preparedRelease.release,
                      },
                  }
                : submission;
        pendingSubmissionRef.current = preparedSubmission;
        setEditorSelection((currentSelection) =>
            currentSelection?.source === 'catalogue' &&
            currentSelection.key === preparedSubmission.editorSelection.key
                ? preparedSubmission.editorSelection
                : currentSelection,
        );

        const consequences = existingRepository?.consequences ?? {
            git: submission.withGit,
            gitLfs: submission.withGitLfs,
            github: Boolean(submission.publication),
        };
        let result: Awaited<ReturnType<typeof createProject>>;
        try {
            result = await createProject(
                submission.projectName,
                preparedRelease.release,
                submission.renderer,
                submission.codeEditorId,
                submission.withGit,
                submission.overwriteProjectPath,
                existingRepository
                    ? undefined
                    : addCreateProjectGitLfsOptions(
                          gitOptions,
                          submission.gitLfsTrackingPolicy,
                      ),
                existingRepository ? undefined : submission.publication,
                existingRepository
                    ? { root: existingRepository.root }
                    : undefined,
            );
        } catch (creationError) {
            showCreateProjectError(
                creationError instanceof Error
                    ? creationError.message
                    : t('workflow.failed'),
            );
            return;
        }

        if (result.parentRepositoryConfirmation) {
            finishCreateProjectProgress();
            setError(undefined);
            setExistingRepositoryDialog({
                mode: 'confirmation',
                root: result.parentRepositoryConfirmation.root,
                consequences,
                submission: preparedSubmission,
            });
            return;
        }

        if (result.success && result.projectDetails) {
            const repositoryRoot =
                result.gitSetup?.status === 'existing-repository' &&
                !result.gitSetup.isProjectRoot
                    ? result.gitSetup.root
                    : existingRepository?.root;
            if (repositoryRoot) {
                finishCreateProjectProgress();
                setExistingRepositoryDialog({
                    mode: 'completion',
                    root: repositoryRoot,
                    consequences,
                    project: result.projectDetails,
                    submission: preparedSubmission,
                });
                return;
            }
            pendingSubmissionRef.current = null;
            if (preparedSubmission.editNow) {
                setProgressPhase('launching');
                try {
                    await launchProject(result.projectDetails);
                } catch (launchError) {
                    showCreateProjectError(
                        launchError instanceof Error
                            ? launchError.message
                            : t('workflow.launchFailed'),
                    );
                    return;
                }
            } else {
                setProgressPhase('complete');
            }
            finishCreateProjectProgress();
            onOpenChange(false);
            if (
                result.publication?.status === 'published' &&
                shouldShowCreateProjectPublishedAlert(
                    preparedSubmission.editNow,
                )
            ) {
                showPublishedAlert(result.publication.repository);
            }
        } else if (
            result.projectDetails &&
            result.publication?.status === 'failed'
        ) {
            if (
                result.publication.reason ===
                    'local-repository-not-standalone' &&
                result.gitSetup?.status === 'existing-repository' &&
                !result.gitSetup.isProjectRoot
            ) {
                finishCreateProjectProgress();
                setPublicationProject(null);
                setPublicationFailure(null);
                setError(undefined);
                setExistingRepositoryDialog({
                    mode: 'completion',
                    root: result.gitSetup.root,
                    consequences,
                    project: result.projectDetails,
                    submission: preparedSubmission,
                });
                return;
            }
            finishCreateProjectProgress();
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
            pendingSubmissionRef.current = null;
            showCreateProjectError(result.error ?? t('workflow.failed'));
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
                if (shouldShowCreateProjectPublishedAlert(editNow)) {
                    showPublishedAlert(result.publication.repository);
                }
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
                return;
            }
            if (result.publication?.status === 'not-requested') {
                setPublicationFailure(null);
                onOpenChange(false);
                addAlert(
                    t('publishToGitHub.recoveryTitle'),
                    result.error ?? t('publishToGitHub.retryFailed'),
                );
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
     * Continues the existing Git identity and project creation flow.
     *
     * @param submission - Immutable values captured for this Create submission.
     * @returns A promise that resolves after identity or creation handling.
     */
    const continueCreateProject = async (
        submission: CreateProjectSubmission,
    ) => {
        if (!submission.withGit || !gitAvailable) {
            await createSelectedProject(submission);
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
            await createSelectedProject(submission);
            return;
        }
        if (decision.action === 'apply-preset') {
            await createSelectedProject(submission, {
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

    /**
     * Validates and inspects the final project path before identity or creation.
     *
     * @returns A promise that resolves after preflight or creation handling.
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

        if (!(await destinationCheck.checkNow())) return;

        const publicationTarget = publicationTargets.find(
            (target) =>
                getPublicationTargetValue(target) === selectedPublicationTarget,
        );
        if (!editorSelection) {
            return;
        }
        const submission: CreateProjectSubmission = {
            projectName,
            editorSelection,
            renderer,
            codeEditorId,
            withGit,
            withGitLfs,
            gitLfsTrackingPolicy: withGitLfs ? gitLfsPolicy?.id : undefined,
            overwriteProjectPath: overwriteSubmitPath,
            publication:
                publishToGitHub && publicationTarget
                    ? toCreateProjectPublicationOptions(
                          publicationTarget,
                          repositoryName,
                      )
                    : undefined,
            editNow,
        };
        pendingSubmissionRef.current = submission;

        setCheckingProjectRepository(true);
        try {
            const inspection = await inspectCreateProjectRepository(
                submission.projectName,
                submission.overwriteProjectPath,
            );
            if (
                inspection.status === 'inside-work-tree' &&
                !inspection.isProjectRoot
            ) {
                setExistingRepositoryDialog({
                    mode: 'confirmation',
                    root: inspection.root,
                    consequences: {
                        git: submission.withGit,
                        gitLfs: submission.withGitLfs,
                        github: Boolean(submission.publication),
                    },
                    submission,
                });
                return;
            }
        } catch {
            // Repository inspection is advisory. Main-process creation remains authoritative.
        } finally {
            setCheckingProjectRepository(false);
        }

        await continueCreateProject(submission);
    };

    /** Cancels the one-submission parent repository confirmation. */
    const handleCancelExistingRepository = () => {
        pendingSubmissionRef.current = null;
        setExistingRepositoryDialog(null);
    };

    /**
     * Creates the project once without separate repository, LFS, or publication work.
     *
     * @returns A promise that resolves after local project creation.
     */
    const handleContinueExistingRepository = async () => {
        if (existingRepositoryDialog?.mode !== 'confirmation') {
            return;
        }
        const context = existingRepositoryDialog;
        setExistingRepositoryDialog(null);
        await createSelectedProject(context.submission, undefined, context);
    };

    /** Finishes local completion and honours the Edit now choice. */
    const handleExistingRepositoryDone = () => {
        if (existingRepositoryDialog?.mode !== 'completion') {
            return;
        }
        const { project, submission } = existingRepositoryDialog;
        pendingSubmissionRef.current = null;
        setExistingRepositoryDialog(null);
        onOpenChange(false);
        if (submission.editNow) {
            void launchProject(project);
        }
    };

    /** Initializes the project repository without staging or committing. */
    const handleSkipInitialCommit = () => {
        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        void createSelectedProject(submission, { initialCommit: 'skip' });
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

        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        await createSelectedProject(submission, {
            initialCommit: 'create',
            identity: { ...identity, scope },
        });
    };

    /** Uses the complete global identity without writing repository settings. */
    const handleUseGlobalGitIdentity = () => {
        const submission = pendingSubmissionRef.current;
        if (!submission) return;
        setGitIdentityDialogPage(null);
        void createSelectedProject(submission);
    };

    /** Closes Git identity without retaining a stale Create submission. */
    const handleCloseGitIdentity = () => {
        pendingSubmissionRef.current = null;
        setGitIdentityDialogPage(null);
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
     * Selects an exact installed or catalogue editor and updates its renderer default.
     *
     * @param selection - Stable editor selection from the inline picker.
     */
    const changeEditorSelection = (selection: CreateProjectEditorSelection) => {
        setEditorSelection(selection);

        const defaultRenderer = getDefaultRendererForReleaseVersion(
            selection.release.version,
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
            setEditorSelection(null);
            return;
        }

        setRenderer('FORWARD_PLUS');
        setProjectName('');
        setProjectNameAvailability('idle');
        setOverwriteBasePath(defaultOverwriteBasePathRef.current);
        setOverwriteBasePathMissing(false);
        setCheckingOverwriteBasePath(false);
        setEditNow(true);
        setError(undefined);
        setCreating(false);
        setProgressPhase(null);
        setCheckingGitIdentity(false);
        setCheckingProjectRepository(false);
        setExistingRepositoryDialog(null);
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
        pendingSubmissionRef.current = null;
        overwritePathCheckRequestRef.current += 1;
        repositoryNameCheckRequestRef.current += 1;
        overwriteBasePathInitializedRef.current = Boolean(
            defaultOverwriteBasePathRef.current,
        );
    }, [open]);

    const closeDisabled =
        destinationCheck.checkingNow ||
        creating ||
        checkingGitIdentity ||
        checkingProjectRepository ||
        savingGitIdentityPreset ||
        selectingFolder ||
        gitIdentityDialogPage !== null ||
        publicationFailure !== null ||
        existingRepositoryDialog !== null;

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
                    publicationFailure === null &&
                    existingRepositoryDialog === null
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
                {progressPhase && !publicationFailure && (
                    <CreateProjectProgressOverlay
                        className="z-60"
                        phase={progressPhase}
                        editorInstalled={selectedEditorInstalled}
                        editNow={editNow}
                        installProgress={selectedEditorInstallProgress}
                        labels={{
                            title: t('workflow.title'),
                            installingEditor: t('workflow.installingEditor'),
                            creatingProject: t('workflow.creatingProject'),
                            launchingEditor: t('workflow.launchingEditor'),
                            skipped: t('workflow.skipped'),
                        }}
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
                    <Drawer.Body className="flex flex-col gap-4 pt-2">
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
                            inputNameRef={inputNameRef}
                            editorPicker={
                                <CreateProjectEditorPicker
                                    open={open}
                                    installedReleases={installedReleases}
                                    availableReleases={availableReleases}
                                    availablePrereleases={availablePrereleases}
                                    releaseInstallProgress={
                                        releaseInstallProgress
                                    }
                                    loading={loadingReleases}
                                    selection={editorSelection}
                                    onSelectionChange={changeEditorSelection}
                                    onCancelInstall={(jobId) =>
                                        void cancelInstall(jobId)
                                    }
                                />
                            }
                            projectName={projectName}
                            projectNameError={
                                projectNameAvailability === 'unavailable'
                                    ? t('project.nameExists')
                                    : undefined
                            }
                            overwriteBasePath={overwriteBasePath}
                            overwriteDisplayPath={overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                overwritePathSuffixDisplay
                            }
                            showUseDefaultPathAction={showUseDefaultPathAction}
                            showFolderCreateIcon={showFolderCreateIcon}
                            isOverwritePathEmpty={isOverwritePathEmpty}
                            onProjectNameChange={setProjectName}
                            onOverwriteBasePathChange={setOverwriteBasePath}
                            onUseDefaultPath={() =>
                                setOverwriteBasePath(defaultOverwriteBasePath)
                            }
                            onSelectProjectFolder={() =>
                                void handleSelectProjectFolder()
                            }
                            destinationStatus={
                                <CreateProjectDestinationStatus
                                    status={destinationCheck.status}
                                    error={destinationCheck.error}
                                    checkingLabel={t('destination.checking')}
                                    availableLabel={t('destination.available')}
                                />
                            }
                        />
                        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                            <CreateProjectRendererSection
                                t={t}
                                renderer={renderer}
                                versionNumber={
                                    editorSelection?.release.version_number || 0
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
                        <div className="flex flex-col gap-3 border-t border-base-300 pt-3">
                            <CreateProjectSourceControlSection
                                t={t}
                                loading={loadingTools || loadingGitLfsPolicy}
                                gitAvailable={gitAvailable}
                                gitLfsAvailable={gitLfsAvailable}
                                gitLfsPolicy={gitLfsPolicy}
                                withGit={withGit}
                                withGitLfs={withGitLfs}
                                publishToGitHub={publishToGitHub}
                                publishingLocked={publicationFailure !== null}
                                onWithGitChange={setWithGit}
                                onWithGitLfsChange={setWithGitLfs}
                                onPublishToGitHubChange={
                                    handlePublishToGitHubChange
                                }
                            />
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
                                        ? t(
                                              'publishToGitHub.repositoryNameInvalid',
                                          )
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
                        </div>
                    </Drawer.Body>
                    <Drawer.Footer className="justify-between">
                        <CreateProjectActions
                            editNow={editNow}
                            creating={
                                destinationCheck.checkingNow ||
                                creating ||
                                checkingGitIdentity ||
                                checkingProjectRepository
                            }
                            createDisabled={
                                destinationCheck.status !== 'available' ||
                                loadingTools ||
                                loadingGitLfsPolicy ||
                                editorSelection === null ||
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
                                editorSelection?.source === 'catalogue' &&
                                    !editorSelection.installedRelease
                                    ? publishToGitHub
                                        ? 'buttons.installCreateAndPublish'
                                        : 'buttons.installAndCreate'
                                    : publishToGitHub
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
            {existingRepositoryDialog && (
                <CreateProjectExistingRepositoryDialog
                    mode={existingRepositoryDialog.mode}
                    root={existingRepositoryDialog.root}
                    consequences={existingRepositoryDialog.consequences}
                    t={t}
                    returnFocusRef={createButtonRef}
                    onCancel={handleCancelExistingRepository}
                    onContinue={() => void handleContinueExistingRepository()}
                    onDone={handleExistingRepositoryDone}
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
                    allowSkip={!pendingSubmissionRef.current?.publication}
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
                    onRequestClose={handleCloseGitIdentity}
                    returnFocusRef={createButtonRef}
                />
            )}
        </>
    );
};
