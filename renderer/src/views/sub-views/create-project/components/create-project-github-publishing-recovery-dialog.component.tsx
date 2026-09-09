import type {
    CreateProjectPublicationOutcome,
    CreateProjectPublicationTarget,
} from '@shared/contracts';
import { ExternalLink } from 'lucide-react';
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
            tone="warning"
            panelClassName="max-w-xl"
            returnFocusRef={returnFocusRef}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={busy}
                        onClick={onContinueLocally}
                    >
                        {t('publishToGitHub.continueLocally')}
                    </button>
                    {canOpenRepository && (
                        <button
                            type="button"
                            className="btn btn-ghost text-base"
                            disabled={busy}
                            onClick={onOpenGitHub}
                        >
                            {t('publishToGitHub.openGitHub')}
                            <ExternalLink
                                size={16}
                                className="shrink-0 opacity-50"
                                aria-hidden="true"
                            />
                        </button>
                    )}
                    {failure.canRetry && (
                        <button
                            type="button"
                            className="btn btn-primary text-base"
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
            <div className="flex flex-col gap-4 text-base">
                <p className="font-semibold">
                    {t('publishToGitHub.recoverySafe')}
                </p>
                <p className="text-base-content/75">{t(recoveryMessageKey)}</p>
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
                    onTargetChange={onTargetChange}
                    onRepositoryNameChange={onRepositoryNameChange}
                />
            </div>
        </Dialog>
    );
};
