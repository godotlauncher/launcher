import type { CreateProjectPublicationTarget } from '@shared/contracts';
import clsx from 'clsx';
import { CheckCircle2, CircleAlert, CircleX } from 'lucide-react';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/select-field.component';
import { TextField } from '../../../../components/ui/text-field.component';
import { getPublicationTargetValue } from '../create-project.model';

type Translate = (key: string, values?: Record<string, string>) => string;

export type RepositoryNameAvailabilityState =
    | 'idle'
    | 'checking'
    | 'available'
    | 'unavailable'
    | 'unknown';

type RepositoryCreationFieldsProps = {
    t: Translate;
    ownerId: string;
    repositoryNameId: string;
    targets: CreateProjectPublicationTarget[];
    selectedTargetValue: string;
    repositoryName: string;
    availability: RepositoryNameAvailabilityState;
    repositoryNameError?: string;
    layout?: 'columns' | 'stacked';
    availabilityBelow?: boolean;
    disabled?: boolean;
    locked?: boolean;
    repositoryNameInputRef?: React.Ref<HTMLInputElement>;
    onTargetChange: (value: string) => void;
    onRepositoryNameChange: (name: string) => void;
};

/**
 * Builds disambiguated repository-owner options.
 *
 * @param t - Create Project translator.
 * @param targets - Renderer-safe repository-creation targets.
 * @returns Select options with connected-account context when needed.
 */
export function getRepositoryCreationTargetOptions(
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

/** Renders the repository-name availability result. */
const RepositoryAvailability: React.FC<{
    t: Translate;
    availability: RepositoryNameAvailabilityState;
}> = ({ t, availability }) => {
    if (availability === 'idle') {
        return null;
    }

    const content = {
        checking: {
            icon: (
                <span
                    className="loading loading-spinner loading-xs shrink-0"
                    aria-hidden="true"
                />
            ),
            label: t('publishToGitHub.availabilityChecking'),
        },
        available: {
            icon: (
                <CheckCircle2
                    size={14}
                    className="shrink-0"
                    aria-hidden="true"
                />
            ),
            label: t('publishToGitHub.availabilityAvailable'),
        },
        unavailable: {
            icon: <CircleX size={14} className="shrink-0" aria-hidden="true" />,
            label: t('publishToGitHub.availabilityUnavailable'),
        },
        unknown: {
            icon: (
                <CircleAlert
                    size={14}
                    className="shrink-0"
                    aria-hidden="true"
                />
            ),
            label: t('publishToGitHub.availabilityUnknown'),
        },
    }[availability];

    return (
        <span
            className={clsx(
                'flex min-h-5 items-start gap-1.5 text-sm',
                availability === 'available'
                    ? 'text-success-content dark:text-success'
                    : availability === 'unavailable'
                      ? 'text-error'
                      : availability === 'unknown'
                        ? 'text-warning-content dark:text-warning'
                        : 'text-base-content/60',
            )}
            role="status"
            aria-live="polite"
        >
            {content.icon}
            <span>{content.label}</span>
        </span>
    );
};

/**
 * Renders reusable owner and repository-name controls for repository creation.
 *
 * @param props - Controlled owner, name, availability, and editing state.
 * @returns The shared repository-creation fields.
 */
export const RepositoryCreationFields: React.FC<
    RepositoryCreationFieldsProps
> = ({
    t,
    ownerId,
    repositoryNameId,
    targets,
    selectedTargetValue,
    repositoryName,
    availability,
    repositoryNameError,
    layout = 'columns',
    availabilityBelow = false,
    disabled = false,
    locked = false,
    repositoryNameInputRef,
    onTargetChange,
    onRepositoryNameChange,
}) => {
    const unavailableError =
        availability === 'unavailable'
            ? t('publishToGitHub.availabilityUnavailable')
            : undefined;

    return (
        <div
            className={clsx(
                'grid grid-cols-1 gap-4',
                layout === 'columns' && 'md:grid-cols-2',
            )}
        >
            <SelectField
                size="sm"
                id={ownerId}
                testId={ownerId}
                label={t('publishToGitHub.owner')}
                help={t('publishToGitHub.ownerHelp')}
                value={selectedTargetValue}
                onChange={onTargetChange}
                options={getRepositoryCreationTargetOptions(t, targets)}
                disabled={disabled || locked}
                showSelectedCheck
            />
            <div className="flex min-w-0 flex-col gap-1">
                <TextField
                    id={repositoryNameId}
                    testId={repositoryNameId}
                    inputRef={repositoryNameInputRef}
                    label={t('publishToGitHub.repositoryName')}
                    labelAction={
                        !availabilityBelow &&
                        !repositoryNameError &&
                        !unavailableError && (
                            <RepositoryAvailability
                                t={t}
                                availability={availability}
                            />
                        )
                    }
                    help={t('publishToGitHub.repositoryNameHelp')}
                    value={repositoryName}
                    onChange={onRepositoryNameChange}
                    error={repositoryNameError ?? unavailableError}
                    disabled={disabled || locked}
                />
                {availabilityBelow &&
                    !repositoryNameError &&
                    !unavailableError && (
                        <RepositoryAvailability
                            t={t}
                            availability={availability}
                        />
                    )}
            </div>
        </div>
    );
};
