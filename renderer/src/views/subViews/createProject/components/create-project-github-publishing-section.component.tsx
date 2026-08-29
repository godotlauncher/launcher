import type {
    CreateProjectPublicationOutcome,
    CreateProjectPublicationTarget,
    CreateProjectPublicationTargetFailureReason,
} from '@shared/contracts';
import { ExternalLink } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/selectField.component';
import { TextField } from '../../../../components/ui/textField.component';
import { getPublicationTargetValue } from '../createProject.model';

type Translate = (key: string, values?: Record<string, string>) => string;

type FailedPublication = Extract<
    CreateProjectPublicationOutcome,
    { status: 'failed' }
>;

type CreateProjectGitHubPublishingSectionProps = {
    t: Translate;
    enabled: boolean;
    loading: boolean;
    targets: CreateProjectPublicationTarget[];
    targetFailure: CreateProjectPublicationTargetFailureReason | null;
    selectedTargetValue: string;
    repositoryName: string;
    repositoryNameError?: string;
    disabled: boolean;
    failure: FailedPublication | null;
    onTargetChange: (value: string) => void;
    onRepositoryNameChange: (name: string) => void;
    onOpenConnections: () => void;
    onRetry: () => void;
    onContinueLocally: () => void;
    onOpenGitHub: () => void;
};

/** Builds disambiguated owner labels for the selector. */
function getTargetOptions(
    t: Translate,
    targets: CreateProjectPublicationTarget[],
): SelectFieldOption[] {
    const ownerCounts = new Map<string, number>();
    for (const target of targets) {
        ownerCounts.set(
            target.ownerLogin,
            (ownerCounts.get(target.ownerLogin) ?? 0) + 1,
        );
    }

    return [
        { value: '', label: t('publishToGitHub.ownerPlaceholder') },
        ...targets.map((target) => ({
            value: getPublicationTargetValue(target),
            label:
                (ownerCounts.get(target.ownerLogin) ?? 0) > 1
                    ? t('publishToGitHub.ownerViaAccount', {
                          owner: target.ownerLogin,
                          account: target.accountLogin,
                      })
                    : target.ownerLogin,
        })),
    ];
}

/**
 * Renders the progressive private GitHub publishing choices and recovery.
 *
 * @param props - Controlled publishing state and actions.
 * @returns The GitHub publishing section.
 */
export const CreateProjectGitHubPublishingSection: React.FC<
    CreateProjectGitHubPublishingSectionProps
> = ({
    t,
    enabled,
    loading,
    targets,
    targetFailure,
    selectedTargetValue,
    repositoryName,
    repositoryNameError,
    disabled,
    failure,
    onTargetChange,
    onRepositoryNameChange,
    onOpenConnections,
    onRetry,
    onContinueLocally,
    onOpenGitHub,
}) => {
    const connectionProblem = targetFailure !== null;
    const repositoryKnown = Boolean(failure?.repository);

    if (!enabled) return null;

    return (
        <section className="border-t-2 border-primary bg-base-200/70 p-4">
            <h2 className="mb-4 text-md font-medium">
                {t('publishToGitHub.repositoryTitle')}
            </h2>
            <div>
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-base-content/70">
                        <span className="loading loading-spinner loading-xs" />
                        {t('publishToGitHub.loadingOwners')}
                    </div>
                ) : connectionProblem ? (
                    <div className="alert alert-warning alert-soft flex-col items-start gap-3 sm:flex-row sm:items-center">
                        <span className="flex-1">
                            {t(
                                `publishToGitHub.targetFailure.${targetFailure}`,
                            )}
                        </span>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={onOpenConnections}
                        >
                            {t('publishToGitHub.openConnections')}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <SelectField
                            id="selectCreateProjectGitHubOwner"
                            testId="selectCreateProjectGitHubOwner"
                            label={t('publishToGitHub.owner')}
                            help={t('publishToGitHub.ownerHelp')}
                            value={selectedTargetValue}
                            onChange={onTargetChange}
                            options={getTargetOptions(t, targets)}
                            disabled={disabled || repositoryKnown}
                            showSelectedCheck
                            compact
                            regularText
                        />
                        <TextField
                            id="createProjectGitHubRepositoryName"
                            label={t('publishToGitHub.repositoryName')}
                            help={t('publishToGitHub.repositoryNameHelp')}
                            value={repositoryName}
                            onChange={onRepositoryNameChange}
                            error={repositoryNameError}
                            disabled={disabled || repositoryKnown}
                            compact
                            regularText
                        />
                    </div>
                )}
            </div>

            {failure && (
                <div className="mt-4 border-t border-base-300 pt-4">
                    <div className="alert alert-error alert-soft flex-col items-start">
                        <div className="font-medium">
                            {t('publishToGitHub.recoveryTitle')}
                        </div>
                        <p>{t(`publishToGitHub.failure.${failure.reason}`)}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {failure.canRetry && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={onRetry}
                                >
                                    {t('publishToGitHub.retry')}
                                </button>
                            )}
                            {(failure.repository ||
                                failure.intendedRepository) && (
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={onOpenGitHub}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    {t('publishToGitHub.openGitHub')}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={onContinueLocally}
                            >
                                {t('publishToGitHub.continueLocally')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
