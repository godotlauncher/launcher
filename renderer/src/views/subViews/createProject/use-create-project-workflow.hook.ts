import type {
    CreateProjectGitOptions,
    ProjectDetails,
    PublishedGitHubRepository,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../../hooks/useAlerts';
import { useAppNavigation } from '../../../hooks/useAppNavigation';
import { useProjects } from '../../../hooks/useProjects';
import type {
    CreateProjectProgressPhase,
    CreateProjectSubmission,
    ExistingRepositoryConsequences,
    ExistingRepositoryDialogState,
    FailedPublication,
} from './create-project-workflow.types';
import {
    addCreateProjectGitLfsOptions,
    getPublicationTargetValue,
    isCreateProjectNameAvailable,
    prepareCreateProjectRelease,
    shouldShowCreateProjectPublishedAlert,
    toCreateProjectPublicationOptions,
} from './createProject.model';
import type { useCreateProjectForm } from './use-create-project-form.hook';
import { useCreateProjectGitIdentity } from './use-create-project-git-identity.hook';
import type { useCreateProjectIntegrations } from './use-create-project-integrations.hook';
import { useCreateProjectPublication } from './use-create-project-publication.hook';

/**
 * Coordinates creation and recovery, retaining successful progress through drawer closing.
 *
 * @param open - Whether the drawer session is open.
 * @param onOpenChange - Requests a change in drawer visibility.
 * @param form - Editable project values and destination validation.
 * @param integrations - Available tools and the selected integration options.
 * @param showPublishedAlert - Presents a successful publication and its repository action.
 * @returns Workflow state, publication and identity controls, and submission actions.
 */
export function useCreateProjectWorkflow(
    open: boolean,
    onOpenChange: (open: boolean) => void,
    form: ReturnType<typeof useCreateProjectForm>,
    integrations: ReturnType<typeof useCreateProjectIntegrations>,
    showPublishedAlert: (repository: PublishedGitHubRepository) => void,
) {
    const { t } = useTranslation(['createProject', 'common']);
    const { addAlert } = useAlerts();
    const { openExternalLink } = useAppNavigation();
    const [connectionOpen, setConnectionOpen] = useState(false);
    const {
        projects,
        createProject,
        launchProject,
        inspectCreateProjectRepository,
        retryCreateProjectPublication,
        discardCreateProjectPublication,
    } = useProjects();
    const {
        projectName,
        editorSelection,
        renderer,
        overwriteSubmitPath,
        editNow,
        destinationCheck,
        setEditorSelection,
    } = form;
    const { installRelease } = form.releaseApi;
    const { withGit, withGitLfs, codeEditorId, gitLfsPolicy, gitAvailable } =
        integrations;
    const [error, setError] = useState<string | undefined>();
    const [creating, setCreating] = useState<boolean>(false);
    const [progressPhase, setProgressPhase] =
        useState<CreateProjectProgressPhase | null>(null);
    const [checkingProjectRepository, setCheckingProjectRepository] =
        useState<boolean>(false);
    const [existingRepositoryDialog, setExistingRepositoryDialog] =
        useState<ExistingRepositoryDialogState | null>(null);
    const [publicationFailure, setPublicationFailure] =
        useState<FailedPublication | null>(null);
    const [publicationProject, setPublicationProject] =
        useState<ProjectDetails | null>(null);
    const pendingSubmissionRef = useRef<CreateProjectSubmission | null>(null);

    const publication = useCreateProjectPublication(
        open,
        projectName,
        withGit,
        publicationFailure,
    );
    const {
        publishToGitHub,
        selectedPublicationTarget,
        repositoryName,
        publicationTargets,
        setRepositoryNameAvailability,
    } = publication;
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
            }
            // Keep the form covered during the closing transition; opening resets it.
            setProgressPhase('complete');
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

    const identity = useCreateProjectGitIdentity(
        pendingSubmissionRef,
        createSelectedProject,
        gitAvailable,
    );
    const {
        checkingGitIdentity,
        savingGitIdentityPreset,
        gitIdentityDialogPage,
        continueCreateProject,
    } = identity;

    /**
     * Changes publication fields and clears recovery from the previous selection.
     * @param enabled - Whether to publish the new project to GitHub.
     */
    const handlePublishToGitHubChange = (enabled: boolean) => {
        setPublicationFailure(null);
        setPublicationProject(null);
        publication.handlePublishToGitHubChange(enabled);
    };
    /** Retries the exact failed publication attempt without recreating local work. */
    const handleRetryPublication = async () => {
        if (!publicationFailure) return;

        if (publicationFailure.canEdit && !publication.publicationOptionsValid)
            return;

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

    /** Opens GitHub setup without resetting the current project form. */
    const handleOpenConnections = () => setConnectionOpen(true);

    /** Returns to the preserved form and reloads the available GitHub owners. */
    const handleConnected = () => {
        setConnectionOpen(false);
        void publication.loadPublicationTargets();
    };

    /** Dismisses GitHub setup while retaining the current form values. */
    const handleCancelConnection = () => setConnectionOpen(false);

    /**
     * Validates and inspects the final project path before identity or creation.
     *
     * @returns A promise that resolves after preflight or creation handling.
     */
    const onCreateProject = async () => {
        setError(undefined);

        if (publishToGitHub && !publication.publicationOptionsValid) return;

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

    // Keep all domain resets together and read the current actions only on opening.
    const resetSessionRef = useRef(() => {});
    resetSessionRef.current = () => {
        setConnectionOpen(false);
        form.reset();
        integrations.reset();
        publication.reset();
        identity.reset();
        setError(undefined);
        setCreating(false);
        setProgressPhase(null);
        setCheckingProjectRepository(false);
        setExistingRepositoryDialog(null);
        setPublicationFailure(null);
        setPublicationProject(null);
        pendingSubmissionRef.current = null;
    };
    useEffect(() => {
        if (open) resetSessionRef.current();
    }, [open]);

    const closeDisabled =
        connectionOpen ||
        destinationCheck.checkingNow ||
        creating ||
        checkingGitIdentity ||
        checkingProjectRepository ||
        savingGitIdentityPreset ||
        form.selectingFolder ||
        gitIdentityDialogPage !== null ||
        publicationFailure !== null ||
        existingRepositoryDialog !== null;

    const createDisabled =
        connectionOpen ||
        destinationCheck.status !== 'available' ||
        integrations.loadingTools ||
        integrations.loadingGitLfsPolicy ||
        editorSelection === null ||
        form.projectNameAvailability === 'checking' ||
        form.projectNameAvailability === 'unavailable' ||
        form.isOverwritePathEmpty ||
        publicationFailure !== null ||
        (publishToGitHub &&
            (publication.publicationTargetsLoading ||
                publication.publicationTargetFailure !== null ||
                !publication.publicationOptionsValid));

    return {
        publication,
        identity,
        error,
        creating,
        progressPhase,
        publicationFailure,
        existingRepositoryDialog,
        closeDisabled,
        createDisabled,
        submissionBusy:
            destinationCheck.checkingNow ||
            creating ||
            checkingGitIdentity ||
            checkingProjectRepository,
        trapFocus:
            !connectionOpen &&
            gitIdentityDialogPage === null &&
            publicationFailure === null &&
            existingRepositoryDialog === null,
        handlePublishToGitHubChange,
        handleRetryPublication,
        handleContinueLocally,
        handleOpenPublicationRepository,
        handleOpenConnections,
        connectionOpen,
        handleConnected,
        handleCancelConnection,
        handleCancelExistingRepository,
        handleContinueExistingRepository,
        handleExistingRepositoryDone,
        onCreateProject,
    };
}
