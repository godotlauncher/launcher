import type {
    CreateProjectPublicationOutcome,
    CreateProjectPublicationTarget,
} from '@shared/contracts';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';
import { Dialog } from '../../../../components/dialog.component';
import {
    RepositoryCreationFields,
    type RepositoryNameAvailabilityState,
} from './repository-creation-fields.component';

type Translate = (key: string, values?: Record<string, string>) => string;

type FailedPublication = Extract<
    CreateProjectPublicationOutcome,
    { status: 'failed' }
>;

type CreateProjectGitHubPublishingRecoveryDialogProps = {
    t: Translate;
    failure: FailedPublication;
    targets: CreateProjectPublicationTarget[];
    selectedTargetValue: string;
    repositoryName: string;
    availability: RepositoryNameAvailabilityState;
    repositoryNameError?: string;
    busy: boolean;
    retryDisabled: boolean;
    returnFocusRef: React.RefObject<HTMLElement | null>;
    onTargetChange: (value: string) => void;
    onRepositoryNameChange: (name: string) => void;
    onRetry: () => void;
    onContinueLocally: () => void;
    onOpenGitHub: () => void;
};

/**
 * Renders recoverable GitHub publishing failures in the shared app dialog.
 *
 * @param props - Failure details, shared repository fields, and recovery actions.
 * @returns The publishing recovery dialog.
 */
export const CreateProjectGitHubPublishingRecoveryDialog: React.FC<
    CreateProjectGitHubPublishingRecoveryDialogProps
> = ({
    t,
    failure,
    targets,
    selectedTargetValue,
    repositoryName,
    availability,
    repositoryNameError,
    busy,
    retryDisabled,
    returnFocusRef,
    onTargetChange,
    onRepositoryNameChange,
    onRetry,
    onContinueLocally,
    onOpenGitHub,
}) => {
    const repositoryNameInputRef = useRef<HTMLInputElement>(null);
    const canOpenRepository = Boolean(
        failure.repository ||
            (failure.reason === 'remote-creation-uncertain' &&
                failure.intendedRepository),
    );
    const recoveryMessageKey =
        failure.recoveryAction === 'confirm-recovered-repository'
            ? 'publishToGitHub.recoveryRepositoryFound'
            : failure.reason === 'local-repository-not-standalone'
              ? 'publishToGitHub.requiresInitialCommit'
              : `publishToGitHub.failure.${failure.reason}`;
    const retryLabelKey =
        failure.recoveryAction === 'check-and-retry'
            ? 'publishToGitHub.checkAndRetry'
            : failure.recoveryAction === 'confirm-recovered-repository'
              ? 'publishToGitHub.useRepository'
              : 'publishToGitHub.retry';

    return (
        <Dialog
            title={t('publishToGitHub.recoveryDialogTitle')}
            icon={<TriangleAlert className="text-error" aria-hidden="true" />}
            panelClassName="max-w-xl"
            initialFocusRef={
                failure.canEdit ? repositoryNameInputRef : undefined
            }
            returnFocusRef={returnFocusRef}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={onContinueLocally}
                    >
                        {t('publishToGitHub.continueLocally')}
                    </button>
                    {canOpenRepository && (
                        <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={onOpenGitHub}
                        >
                            <ExternalLink size={16} aria-hidden="true" />
                            {t('publishToGitHub.openGitHub')}
                        </button>
                    )}
                    {failure.canRetry && (
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || retryDisabled}
                            onClick={onRetry}
                        >
                            {busy && (
                                <span className="loading loading-spinner loading-xs" />
                            )}
                            {t(retryLabelKey)}
                        </button>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div>
                    <p className="font-medium text-base-content">
                        {t('publishToGitHub.recoverySafe')}
                    </p>
                    <p className="mt-1">{t(recoveryMessageKey)}</p>
                </div>
                <RepositoryCreationFields
                    t={t}
                    ownerId="selectRecoverProjectGitHubOwner"
                    repositoryNameId="recoverProjectGitHubRepositoryName"
                    targets={targets}
                    selectedTargetValue={selectedTargetValue}
                    repositoryName={repositoryName}
                    availability={availability}
                    repositoryNameError={repositoryNameError}
                    layout="stacked"
                    disabled={busy}
                    locked={!failure.canEdit}
                    repositoryNameInputRef={repositoryNameInputRef}
                    onTargetChange={onTargetChange}
                    onRepositoryNameChange={onRepositoryNameChange}
                />
            </div>
        </Dialog>
    );
};
