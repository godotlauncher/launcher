import type { PublishedGitHubRepository } from '@shared/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { WaitingForDialogOverlay } from '../../components/waitingForDialogOverlay.component';
import { useAlerts } from '../../hooks/useAlerts';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { CreateProjectDestinationStatus } from './createProject/components/create-project-destination-status.component';
import { CreateProjectEditorPicker } from './createProject/components/create-project-editor-picker.component';
import { CreateProjectExistingRepositoryDialog } from './createProject/components/create-project-existing-repository-dialog.component';
import { CreateProjectGitIdentityDialog } from './createProject/components/create-project-git-identity-dialog.component';
import { CreateProjectGitHubPublishingRecoveryDialog } from './createProject/components/create-project-github-publishing-recovery-dialog.component';
import { CreateProjectGitHubPublishingSection } from './createProject/components/create-project-github-publishing-section.component';
import { CreateProjectProgressOverlay } from './createProject/components/create-project-progress-overlay.component';
import { CreateProjectSourceControlSection } from './createProject/components/create-project-source-control-section.component';
import { CreateProjectActions } from './createProject/components/createProjectActions.component';
import { CreateProjectProjectSection } from './createProject/components/createProjectProjectSection.component';
import { CreateProjectRendererSection } from './createProject/components/createProjectRendererSection.component';
import { CreateProjectToolOptionsSection } from './createProject/components/createProjectToolOptionsSection.component';

import type { CreateProjectDrawerProps } from './createProject/create-project-workflow.types';
import { useCreateProjectForm } from './createProject/use-create-project-form.hook';
import { useCreateProjectIntegrations } from './createProject/use-create-project-integrations.hook';
import { useCreateProjectWorkflow } from './createProject/use-create-project-workflow.hook';

/**
 * Renders the Create Project form and its coordinated workflow surfaces.
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
    const inputNameRef = useRef<HTMLInputElement>(null);
    const { addAlert } = useAlerts();
    const { openExternalLink } = useAppNavigation();
    const form = useCreateProjectForm(open);
    const integrations = useCreateProjectIntegrations(open);

    /**
     * Shows publication success with a safe external repository action.
     * @param repository - The successfully published repository.
     */
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

    const workflow = useCreateProjectWorkflow(
        open,
        onOpenChange,
        form,
        integrations,
        showPublishedAlert,
    );
    const { publication, identity } = workflow;
    const releases = form.releaseApi;
    return (
        <>
            <Drawer
                open={open}
                onOpenChange={onOpenChange}
                side="right"
                closeOnBackdrop={!workflow.closeDisabled}
                closeOnEscape={!workflow.closeDisabled}
                trapFocus={workflow.trapFocus}
                initialFocusRef={inputNameRef}
                width="min(680px, 100vw)"
                panelClassName={
                    identity.gitIdentityDialogPage
                        ? 'max-w-[100vw] border-l-0'
                        : 'max-w-[100vw]'
                }
            >
                {form.selectingFolder && (
                    <WaitingForDialogOverlay
                        className="z-60"
                        message={t('projects:messages.waitingForDialog')}
                    />
                )}
                {workflow.progressPhase && !workflow.publicationFailure && (
                    <CreateProjectProgressOverlay
                        className="z-60"
                        phase={workflow.progressPhase}
                        editorInstalled={form.selectedEditorInstalled}
                        editNow={form.editNow}
                        installProgress={form.selectedEditorInstallProgress}
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
                        disabled={workflow.closeDisabled}
                    />
                </Drawer.Header>
                <form className="flex min-h-0 flex-1 flex-col">
                    <Drawer.Body className="flex flex-col gap-4 pt-2">
                        {workflow.error && (
                            <div
                                className="alert alert-error alert-soft"
                                role="alert"
                            >
                                {workflow.error}
                            </div>
                        )}
                        <CreateProjectProjectSection
                            t={t}
                            inputNameRef={inputNameRef}
                            editorPicker={
                                <CreateProjectEditorPicker
                                    open={open}
                                    installedReleases={
                                        releases.installedReleases
                                    }
                                    availableReleases={
                                        releases.availableReleases
                                    }
                                    availablePrereleases={
                                        releases.availablePrereleases
                                    }
                                    releaseInstallProgress={
                                        releases.releaseInstallProgress
                                    }
                                    loading={releases.loading}
                                    selection={form.editorSelection}
                                    onSelectionChange={
                                        form.changeEditorSelection
                                    }
                                    onCancelInstall={(jobId) =>
                                        void releases.cancelInstall(jobId)
                                    }
                                />
                            }
                            projectName={form.projectName}
                            projectNameError={
                                form.projectNameAvailability === 'unavailable'
                                    ? t('project.nameExists')
                                    : undefined
                            }
                            overwriteBasePath={form.overwriteBasePath}
                            overwriteDisplayPath={form.overwriteDisplayPath}
                            overwritePathSuffixDisplay={
                                form.overwritePathSuffixDisplay
                            }
                            showUseDefaultPathAction={
                                form.showUseDefaultPathAction
                            }
                            showFolderCreateIcon={form.showFolderCreateIcon}
                            isOverwritePathEmpty={form.isOverwritePathEmpty}
                            onProjectNameChange={form.setProjectName}
                            onOverwriteBasePathChange={
                                form.setOverwriteBasePath
                            }
                            onUseDefaultPath={() =>
                                form.setOverwriteBasePath(
                                    form.defaultOverwriteBasePath,
                                )
                            }
                            onSelectProjectFolder={() =>
                                void form.handleSelectProjectFolder()
                            }
                            destinationStatus={
                                <CreateProjectDestinationStatus
                                    status={form.destinationCheck.status}
                                    error={form.destinationCheck.error}
                                    checkingLabel={t('destination.checking')}
                                    availableLabel={t('destination.available')}
                                />
                            }
                        />
                        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                            <CreateProjectRendererSection
                                t={t}
                                renderer={form.renderer}
                                versionNumber={
                                    form.editorSelection?.release
                                        .version_number || 0
                                }
                                onRendererChange={form.setRenderer}
                            />
                            <CreateProjectToolOptionsSection
                                t={t}
                                loadingCodeEditors={
                                    integrations.loadingCodeEditors
                                }
                                codeEditorLoadFailed={
                                    integrations.codeEditorLoadFailed
                                }
                                codeEditorSettings={
                                    integrations.codeEditorSettings
                                }
                                codeEditorId={integrations.codeEditorId}
                                onCodeEditorIdChange={
                                    integrations.setCodeEditorId
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-3 border-t border-base-300 pt-3">
                            <CreateProjectSourceControlSection
                                t={t}
                                loading={
                                    integrations.loadingTools ||
                                    integrations.loadingGitLfsPolicy
                                }
                                gitAvailable={integrations.gitAvailable}
                                gitLfsAvailable={integrations.gitLfsAvailable}
                                gitLfsPolicy={integrations.gitLfsPolicy}
                                withGit={integrations.withGit}
                                withGitLfs={integrations.withGitLfs}
                                publishToGitHub={publication.publishToGitHub}
                                publishingLocked={
                                    workflow.publicationFailure !== null
                                }
                                onWithGitChange={integrations.setWithGit}
                                onWithGitLfsChange={integrations.setWithGitLfs}
                                onPublishToGitHubChange={
                                    workflow.handlePublishToGitHubChange
                                }
                            />
                            <CreateProjectGitHubPublishingSection
                                t={t}
                                enabled={publication.publishToGitHub}
                                loading={publication.publicationTargetsLoading}
                                targets={publication.publicationTargets}
                                targetFailure={
                                    publication.publicationTargetFailure
                                }
                                selectedTargetValue={
                                    publication.selectedPublicationTarget
                                }
                                repositoryName={publication.repositoryName}
                                availability={
                                    publication.repositoryNameAvailability
                                }
                                repositoryNameError={
                                    publication.publishToGitHub &&
                                    publication.repositoryName.length > 0 &&
                                    !publication.repositoryNameValid
                                        ? t(
                                              'publishToGitHub.repositoryNameInvalid',
                                          )
                                        : undefined
                                }
                                disabled={
                                    !integrations.withGit ||
                                    !integrations.gitAvailable
                                }
                                onTargetChange={
                                    publication.setSelectedPublicationTarget
                                }
                                onRepositoryNameChange={
                                    publication.changeRepositoryName
                                }
                                onOpenConnections={
                                    workflow.handleOpenConnections
                                }
                            />
                        </div>
                    </Drawer.Body>
                    <Drawer.Footer className="justify-between">
                        <CreateProjectActions
                            editNow={form.editNow}
                            creating={workflow.submissionBusy}
                            createDisabled={workflow.createDisabled}
                            editNowLabel={t('buttons.editNow')}
                            cancelLabel={t('common:buttons.cancel')}
                            createLabel={t(
                                form.editorSelection?.source === 'catalogue' &&
                                    !form.editorSelection.installedRelease
                                    ? publication.publishToGitHub
                                        ? 'buttons.installCreateAndPublish'
                                        : 'buttons.installAndCreate'
                                    : publication.publishToGitHub
                                      ? 'buttons.createAndPublish'
                                      : 'buttons.create',
                            )}
                            onEditNowChange={form.setEditNow}
                            onCancel={() => onOpenChange(false)}
                            onCreateProject={() =>
                                void workflow.onCreateProject()
                            }
                            createButtonRef={createButtonRef}
                        />
                    </Drawer.Footer>
                </form>
            </Drawer>
            {workflow.publicationFailure && (
                <CreateProjectGitHubPublishingRecoveryDialog
                    t={t}
                    failure={workflow.publicationFailure}
                    targets={publication.publicationTargets}
                    selectedTargetValue={publication.selectedPublicationTarget}
                    repositoryName={publication.repositoryName}
                    availability={publication.repositoryNameAvailability}
                    repositoryNameError={
                        publication.repositoryName.length > 0 &&
                        !publication.repositoryNameValid
                            ? t('publishToGitHub.repositoryNameInvalid')
                            : undefined
                    }
                    busy={workflow.creating}
                    retryDisabled={
                        workflow.publicationFailure.canEdit &&
                        !publication.publicationOptionsValid
                    }
                    returnFocusRef={createButtonRef}
                    onTargetChange={publication.setSelectedPublicationTarget}
                    onRepositoryNameChange={publication.changeRepositoryName}
                    onRetry={() => void workflow.handleRetryPublication()}
                    onContinueLocally={() =>
                        void workflow.handleContinueLocally()
                    }
                    onOpenGitHub={workflow.handleOpenPublicationRepository}
                />
            )}
            {workflow.existingRepositoryDialog && (
                <CreateProjectExistingRepositoryDialog
                    mode={workflow.existingRepositoryDialog.mode}
                    root={workflow.existingRepositoryDialog.root}
                    consequences={
                        workflow.existingRepositoryDialog.consequences
                    }
                    t={t}
                    returnFocusRef={createButtonRef}
                    onCancel={workflow.handleCancelExistingRepository}
                    onContinue={() =>
                        void workflow.handleContinueExistingRepository()
                    }
                    onDone={workflow.handleExistingRepositoryDone}
                />
            )}
            {identity.gitIdentityDialogPage && (
                <CreateProjectGitIdentityDialog
                    page={identity.gitIdentityDialogPage}
                    name={identity.gitIdentityName}
                    email={identity.gitIdentityEmail}
                    scope={identity.gitIdentityScope}
                    showValidation={identity.showGitIdentityValidation}
                    globalIdentityComplete={identity.globalIdentityComplete}
                    showDefaultChoices={!identity.suggestedGitIdentityPreset}
                    saveChoice={identity.gitIdentitySaveChoice}
                    saving={identity.savingGitIdentityPreset}
                    saveError={identity.gitIdentitySaveError}
                    allowSkip={identity.allowSkip}
                    t={t}
                    onNameChange={identity.changeName}
                    onEmailChange={identity.changeEmail}
                    onScopeChange={identity.changeScope}
                    onSaveChoiceChange={identity.changeSaveChoice}
                    onSkip={identity.handleSkipInitialCommit}
                    onAddIdentity={identity.addIdentity}
                    onUseGlobal={identity.handleUseGlobalGitIdentity}
                    onUseDifferentIdentity={
                        identity.handleUseDifferentGitIdentity
                    }
                    onBack={identity.handleGitIdentityBack}
                    onSave={() => void identity.handleSaveGitIdentity()}
                    onRequestClose={identity.handleCloseGitIdentity}
                    returnFocusRef={createButtonRef}
                />
            )}
        </>
    );
};
