import type { PublishedGitHubRepository } from '@shared/contracts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitHubConnectionDialog } from '../../components/github-connection/github-connection-dialog.component';
import { Drawer } from '../../components/ui/drawer/drawer.component';
import { WaitingForDialogOverlay } from '../../components/waiting-for-dialog-overlay.component';
import { useAlerts } from '../../hooks/alerts.hook';
import { useAppNavigation } from '../../hooks/app-navigation.hook';
import { CreateProjectActions } from './create-project/components/create-project-actions.component';
import { CreateProjectDestinationStatus } from './create-project/components/create-project-destination-status.component';
import { CreateProjectEditorPicker } from './create-project/components/create-project-editor-picker.component';
import { CreateProjectExistingRepositoryDialog } from './create-project/components/create-project-existing-repository-dialog.component';
import { CreateProjectGitIdentityDialog } from './create-project/components/create-project-git-identity-dialog.component';
import { CreateProjectGitHubPublishingRecoveryDialog } from './create-project/components/create-project-github-publishing-recovery-dialog.component';
import { CreateProjectGitHubPublishingSection } from './create-project/components/create-project-github-publishing-section.component';
import { CreateProjectProgressOverlay } from './create-project/components/create-project-progress-overlay.component';
import { CreateProjectProjectSection } from './create-project/components/create-project-project-section.component';
import { CreateProjectRendererSection } from './create-project/components/create-project-renderer-section.component';
import { CreateProjectSourceControlSection } from './create-project/components/create-project-source-control-section.component';
import { CreateProjectToolOptionsSection } from './create-project/components/create-project-tool-options-section.component';
import { DuplicateProjectActions } from './create-project/components/duplicate-project-actions.component';
import { DuplicateProjectCopyOptions } from './create-project/components/duplicate-project-copy-options.component';
import { DuplicateProjectSteps } from './create-project/components/duplicate-project-steps.component';
import { DuplicateProjectSummary } from './create-project/components/duplicate-project-summary.component';

import type { CreateProjectDrawerProps } from './create-project/create-project-workflow.types';
import { useCreateProjectForm } from './create-project/use-create-project-form.hook';
import { useCreateProjectIntegrations } from './create-project/use-create-project-integrations.hook';
import { useCreateProjectWorkflow } from './create-project/use-create-project-workflow.hook';

/**
 * Renders the Create Project form and its coordinated workflow surfaces.
 * @param props - Drawer visibility and change callback.
 * @returns The Create Project drawer.
 */
export const CreateProjectDrawer: React.FC<CreateProjectDrawerProps> = ({
    open,
    onOpenChange,
    sourceProject,
    onDuplicateRegistered,
}) => {
    const { t } = useTranslation([
        'createProject',
        'projects',
        'common',
        'installEditor',
    ]);
    const connectionButtonRef = useRef<HTMLButtonElement>(null);
    const createButtonRef = useRef<HTMLButtonElement>(null);
    const inputNameRef = useRef<HTMLInputElement>(null);
    const stepHeadingRef = useRef<HTMLHeadingElement>(null);
    const [duplicateStep, setDuplicateStep] = useState<1 | 2>(1);
    const previousStepRef = useRef<1 | 2>(1);
    useEffect(() => {
        if (open) return;
        setDuplicateStep(1);
        previousStepRef.current = 1;
    }, [open]);
    useLayoutEffect(() => {
        if (open && previousStepRef.current !== duplicateStep) {
            stepHeadingRef.current?.scrollIntoView({ block: 'start' });
            stepHeadingRef.current?.focus({ preventScroll: true });
        }
        previousStepRef.current = duplicateStep;
    }, [open, duplicateStep]);
    const { addAlert } = useAlerts();
    const { openExternalLink } = useAppNavigation();
    const form = useCreateProjectForm(open, sourceProject);
    const integrations = useCreateProjectIntegrations(
        open,
        sourceProject?.codeEditorId,
    );

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
                    className="btn btn-link"
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
        onDuplicateRegistered,
    );
    const { publication, identity } = workflow;
    const releases = form.releaseApi;
    useEffect(() => {
        if (
            sourceProject &&
            duplicateStep === 2 &&
            form.destinationCheck.status === 'blocked' &&
            !workflow.submissionBusy
        )
            setDuplicateStep(1);
    }, [
        sourceProject,
        duplicateStep,
        form.destinationCheck.status,
        workflow.submissionBusy,
    ]);
    const sourceRendererLabel = sourceProject
        ? ((
              {
                  FORWARD_PLUS: t('renderer.forwardPlus'),
                  MOBILE: t('renderer.mobile'),
                  COMPATIBLE: t('renderer.compatible'),
              } as Record<string, string>
          )[sourceProject.renderer] ?? sourceProject.renderer)
        : '';
    const sourceEditorLabel = sourceProject
        ? `Godot ${sourceProject.release.name && sourceProject.release.name !== sourceProject.release.version ? `${sourceProject.release.name} (${sourceProject.release.version})` : sourceProject.release.version} / ${t(sourceProject.release.mono ? 'project.dotNetBadge' : 'editorPicker.standard')} / ${sourceRendererLabel}`
        : '';
    const editorNotice =
        sourceProject && !form.selectedEditorInstalled
            ? t(
                  releases.loading && !form.editorSelection
                      ? 'common:app.loadingMessage'
                      : form.editorSelection
                        ? 'duplicate.installMatchingEditor'
                        : 'duplicate.matchingEditorUnavailable',
              )
            : undefined;
    const continueDisabled =
        workflow.closeDisabled ||
        form.projectName.trim() === '' ||
        form.projectNameAvailability !== 'available' ||
        form.isOverwritePathEmpty ||
        form.destinationCheck.status !== 'available';
    /** Advances only after a fresh identity and destination check. */
    const continueDuplicate = async (): Promise<void> => {
        if (continueDisabled) return;
        if (await workflow.validateProjectDestination()) setDuplicateStep(2);
    };
    const createLabel = t(
        sourceProject
            ? !form.selectedEditorInstalled && form.editorSelection
                ? publication.publishToGitHub
                    ? 'duplicate.installDuplicateAndPublish'
                    : 'duplicate.installAndDuplicate'
                : publication.publishToGitHub
                  ? 'duplicate.duplicateAndPublish'
                  : 'duplicate.duplicateProject'
            : form.editorSelection?.source === 'catalogue' &&
                !form.editorSelection.installedRelease
              ? publication.publishToGitHub
                  ? 'buttons.installCreateAndPublish'
                  : 'buttons.installAndCreate'
              : publication.publishToGitHub
                ? 'buttons.createAndPublish'
                : 'buttons.create',
    );
    return (
        <>
            <Drawer
                open={open}
                onOpenChange={onOpenChange}
                side="right"
                closeOnBackdrop={!workflow.closeDisabled}
                closeOnEscape={!workflow.closeDisabled}
                trapFocus={workflow.trapFocus}
                width="min(680px, 100vw)"
                panelClassName="max-w-[100vw]"
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
                        onCancelInstall={(jobId) =>
                            void form.releaseApi.cancelInstall(jobId)
                        }
                        withGit={workflow.progressWithGit}
                        publishes={workflow.progressPublishes}
                        copyProgress={workflow.copyProgress}
                        onCancelCopy={workflow.cancelCopy}
                        copyProgressLabel={t('duplicate.progress', {
                            count: workflow.copyProgress?.files ?? 0,
                        })}
                        cancelCopyLabel={t('common:buttons.cancel')}
                        labels={{
                            title: t('workflow.title'),
                            installingEditor: t('workflow.installingEditor'),
                            creatingProject: t(
                                sourceProject
                                    ? 'duplicate.copyingProject'
                                    : 'workflow.creatingProject',
                            ),
                            settingUpGit: t('duplicate.settingUpGit'),
                            configuringProject: t(
                                'duplicate.configuringProject',
                            ),
                            publishingProject: t('duplicate.publishingProject'),
                            launchingEditor: t('workflow.launchingEditor'),
                            skipped: t('workflow.skipped'),
                            cancelDownload: t(
                                'installEditor:progress.cancelDownload',
                            ),
                        }}
                    />
                )}
                <Drawer.Header className="py-3">
                    <Drawer.Title className="text-lg font-semibold">
                        {t(sourceProject ? 'duplicate.title' : 'title')}
                    </Drawer.Title>
                    <Drawer.CloseButton
                        className="btn-sm"
                        data-testid="btnCloseCreateProject"
                        disabled={workflow.closeDisabled}
                    />
                </Drawer.Header>
                <form
                    className="flex min-h-0 flex-1 flex-col"
                    onSubmit={(event) => event.preventDefault()}
                >
                    <Drawer.Body
                        className={
                            sourceProject
                                ? 'pt-4 pb-5 text-base'
                                : 'pt-2 pb-1 text-base'
                        }
                    >
                        <fieldset
                            disabled={workflow.submissionBusy}
                            className={
                                sourceProject
                                    ? 'flex min-w-0 flex-col gap-6'
                                    : 'flex min-w-0 flex-col gap-4'
                            }
                        >
                            {workflow.error && (
                                <div
                                    className="alert alert-error alert-soft text-error-content dark:text-error"
                                    role="alert"
                                >
                                    {workflow.error}
                                </div>
                            )}
                            {sourceProject && (
                                <>
                                    <DuplicateProjectSteps
                                        step={duplicateStep}
                                        label={t('duplicate.stepsLabel')}
                                        projectCopyLabel={t(
                                            'duplicate.projectCopy',
                                        )}
                                        moreOptionsLabel={t(
                                            'duplicate.moreOptions',
                                        )}
                                        headingRef={stepHeadingRef}
                                    />
                                    <DuplicateProjectSummary
                                        source={sourceProject}
                                        name={
                                            duplicateStep === 1
                                                ? t('duplicate.fromSource', {
                                                      name: sourceProject.name,
                                                  })
                                                : form.projectName
                                        }
                                        destination={
                                            duplicateStep === 2
                                                ? form.overwriteDisplayPath
                                                : undefined
                                        }
                                        editorLabel={sourceEditorLabel}
                                        originalUnchangedLabel={
                                            duplicateStep === 1
                                                ? t(
                                                      'duplicate.originalUnchanged',
                                                  )
                                                : undefined
                                        }
                                        editorNotice={editorNotice}
                                    />
                                </>
                            )}
                            {(!sourceProject || duplicateStep === 1) && (
                                <>
                                    <CreateProjectProjectSection
                                        t={t}
                                        duplicate={Boolean(sourceProject)}
                                        inputNameRef={inputNameRef}
                                        editorPicker={
                                            !sourceProject && (
                                                <CreateProjectEditorPicker
                                                    id="createProjectEditorField"
                                                    disabled={
                                                        workflow.submissionBusy
                                                    }
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
                                                    catalogueError={
                                                        releases.hasError
                                                    }
                                                    selection={
                                                        form.editorSelection
                                                    }
                                                    onSelectionChange={
                                                        form.changeEditorSelection
                                                    }
                                                    onCancelInstall={(jobId) =>
                                                        void releases.cancelInstall(
                                                            jobId,
                                                        )
                                                    }
                                                    onRetryCatalogue={
                                                        releases.refreshAvailableReleases
                                                    }
                                                />
                                            )
                                        }
                                        projectName={form.projectName}
                                        projectNameError={
                                            form.projectNameAvailability ===
                                            'unavailable'
                                                ? t('project.nameExists')
                                                : undefined
                                        }
                                        overwriteBasePath={
                                            form.overwriteBasePath
                                        }
                                        overwriteDisplayPath={
                                            form.overwriteDisplayPath
                                        }
                                        overwritePathSuffixDisplay={
                                            form.overwritePathSuffixDisplay
                                        }
                                        showUseDefaultPathAction={
                                            form.showUseDefaultPathAction
                                        }
                                        showFolderCreateIcon={
                                            form.showFolderCreateIcon
                                        }
                                        isOverwritePathEmpty={
                                            form.isOverwritePathEmpty
                                        }
                                        onProjectNameChange={
                                            form.setProjectName
                                        }
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
                                        destinationAvailable={
                                            form.destinationCheck.status ===
                                            'available'
                                        }
                                        destinationStatus={
                                            <CreateProjectDestinationStatus
                                                quietSuccess={Boolean(
                                                    sourceProject,
                                                )}
                                                status={
                                                    form.destinationCheck.status
                                                }
                                                error={
                                                    form.destinationCheck.error
                                                }
                                                checkingLabel={t(
                                                    'destination.checking',
                                                )}
                                                availableLabel={t(
                                                    'destination.available',
                                                )}
                                            />
                                        }
                                    />
                                    {sourceProject && (
                                        <DuplicateProjectCopyOptions
                                            t={t}
                                            copyEditorSettings={
                                                form.copyEditorSettings
                                            }
                                            copySaveData={form.copySaveData}
                                            onCopyEditorSettingsChange={
                                                form.setCopyEditorSettings
                                            }
                                            onCopySaveDataChange={
                                                form.setCopySaveData
                                            }
                                        />
                                    )}
                                </>
                            )}
                            {(!sourceProject || duplicateStep === 2) && (
                                <>
                                    <section
                                        className={
                                            sourceProject
                                                ? 'border-t border-base-content/10 pt-5'
                                                : 'flex flex-col gap-3'
                                        }
                                    >
                                        <div
                                            className={
                                                sourceProject
                                                    ? 'grid grid-cols-1'
                                                    : 'grid grid-cols-1 items-start gap-4 md:grid-cols-2'
                                            }
                                        >
                                            {!sourceProject && (
                                                <CreateProjectRendererSection
                                                    t={t}
                                                    renderer={form.renderer}
                                                    versionNumber={
                                                        form.editorSelection
                                                            ?.release
                                                            .version_number || 0
                                                    }
                                                    onRendererChange={
                                                        form.setRenderer
                                                    }
                                                />
                                            )}
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
                                                codeEditorId={
                                                    integrations.codeEditorId
                                                }
                                                onCodeEditorIdChange={
                                                    integrations.setCodeEditorId
                                                }
                                            />
                                        </div>
                                    </section>
                                    <div
                                        className={
                                            sourceProject
                                                ? 'flex flex-col gap-4 border-t border-base-content/10 pt-5'
                                                : 'flex flex-col gap-2'
                                        }
                                    >
                                        <CreateProjectSourceControlSection
                                            t={t}
                                            duplicate={Boolean(sourceProject)}
                                            loading={
                                                integrations.loadingTools ||
                                                integrations.loadingGitLfsPolicy
                                            }
                                            gitAvailable={
                                                integrations.gitAvailable
                                            }
                                            gitLfsAvailable={
                                                integrations.gitLfsAvailable
                                            }
                                            gitLfsPolicy={
                                                integrations.gitLfsPolicy
                                            }
                                            withGit={integrations.withGit}
                                            withGitLfs={integrations.withGitLfs}
                                            publishToGitHub={
                                                publication.publishToGitHub
                                            }
                                            publishingLocked={
                                                workflow.publicationFailure !==
                                                null
                                            }
                                            onWithGitChange={
                                                integrations.setWithGit
                                            }
                                            onWithGitLfsChange={
                                                integrations.setWithGitLfs
                                            }
                                            onPublishToGitHubChange={
                                                workflow.handlePublishToGitHubChange
                                            }
                                        />
                                        <CreateProjectGitHubPublishingSection
                                            t={t}
                                            quietSuccess={Boolean(
                                                sourceProject,
                                            )}
                                            enabled={
                                                publication.publishToGitHub
                                            }
                                            loading={
                                                publication.publicationTargetsLoading
                                            }
                                            targets={
                                                publication.publicationTargets
                                            }
                                            targetFailure={
                                                publication.publicationTargetFailure
                                            }
                                            selectedTargetValue={
                                                publication.selectedPublicationTarget
                                            }
                                            repositoryName={
                                                publication.repositoryName
                                            }
                                            availability={
                                                publication.repositoryNameAvailability
                                            }
                                            repositoryNameError={
                                                publication.publishToGitHub &&
                                                publication.repositoryName
                                                    .length > 0 &&
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
                                            connectionButtonRef={
                                                connectionButtonRef
                                            }
                                            onOpenConnections={
                                                workflow.handleOpenConnections
                                            }
                                        />
                                    </div>
                                </>
                            )}
                        </fieldset>
                    </Drawer.Body>
                    <Drawer.Footer className="justify-between py-2">
                        {sourceProject ? (
                            <DuplicateProjectActions
                                step={duplicateStep}
                                busy={workflow.closeDisabled}
                                continueDisabled={continueDisabled}
                                createDisabled={workflow.createDisabled}
                                editNow={form.editNow}
                                continueLabel={t('common:buttons.continue')}
                                backLabel={t('common:buttons.back')}
                                cancelLabel={t('common:buttons.cancel')}
                                openInGodotLabel={t('duplicate.openInGodot')}
                                createLabel={createLabel}
                                onContinue={() => void continueDuplicate()}
                                onBack={() => setDuplicateStep(1)}
                                onCancel={() => onOpenChange(false)}
                                onEditNowChange={form.setEditNow}
                                onCreate={() => void workflow.onCreateProject()}
                                createButtonRef={createButtonRef}
                            />
                        ) : (
                            <CreateProjectActions
                                editNow={form.editNow}
                                creating={workflow.submissionBusy}
                                createDisabled={workflow.createDisabled}
                                editNowLabel={t(
                                    sourceProject
                                        ? 'duplicate.openInGodot'
                                        : 'buttons.editNow',
                                )}
                                cancelLabel={t('common:buttons.cancel')}
                                createLabel={createLabel}
                                onEditNowChange={form.setEditNow}
                                onCancel={() => onOpenChange(false)}
                                onCreateProject={() =>
                                    void workflow.onCreateProject()
                                }
                                createButtonRef={createButtonRef}
                            />
                        )}
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
            {open && workflow.connectionOpen && (
                <GitHubConnectionDialog
                    onConnected={workflow.handleConnected}
                    onCancel={workflow.handleCancelConnection}
                    returnFocusRef={connectionButtonRef}
                    fallbackReturnFocusRef={
                        sourceProject ? stepHeadingRef : inputNameRef
                    }
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
