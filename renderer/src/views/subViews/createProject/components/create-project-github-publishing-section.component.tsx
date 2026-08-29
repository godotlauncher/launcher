import type {
    CreateProjectPublicationTarget,
    CreateProjectPublicationTargetFailureReason,
} from '@shared/contracts';
import type React from 'react';
import {
    RepositoryCreationFields,
    type RepositoryNameAvailabilityState,
} from './repository-creation-fields.component';

type Translate = (key: string, values?: Record<string, string>) => string;

type CreateProjectGitHubPublishingSectionProps = {
    t: Translate;
    enabled: boolean;
    loading: boolean;
    targets: CreateProjectPublicationTarget[];
    targetFailure: CreateProjectPublicationTargetFailureReason | null;
    selectedTargetValue: string;
    repositoryName: string;
    availability: RepositoryNameAvailabilityState;
    repositoryNameError?: string;
    disabled: boolean;
    onTargetChange: (value: string) => void;
    onRepositoryNameChange: (name: string) => void;
    onOpenConnections: () => void;
};

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
    availability,
    repositoryNameError,
    disabled,
    onTargetChange,
    onRepositoryNameChange,
    onOpenConnections,
}) => {
    const connectionProblem = targetFailure !== null;

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
                    <RepositoryCreationFields
                        t={t}
                        ownerId="selectCreateProjectGitHubOwner"
                        repositoryNameId="createProjectGitHubRepositoryName"
                        targets={targets}
                        selectedTargetValue={selectedTargetValue}
                        repositoryName={repositoryName}
                        availability={availability}
                        repositoryNameError={repositoryNameError}
                        disabled={disabled}
                        onTargetChange={onTargetChange}
                        onRepositoryNameChange={onRepositoryNameChange}
                    />
                )}
            </div>
        </section>
    );
};
