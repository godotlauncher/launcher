import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { CircleHelp } from 'lucide-react';
import type React from 'react';
import { TooltipIconButton } from '../../../../components/ui/tooltip-icon-button.component';
import { CreateProjectUnavailableStatus } from './create-project-unavailable-status.component';

type Translate = (key: string) => string;

type CreateProjectGitLfsOptionProps = {
    t: Translate;
    available: boolean;
    policy: GitLfsTrackingPolicyDescriptor | null;
    selected: boolean;
    onSelectedChange: (selected: boolean) => void;
};

/**
 * Renders the Git LFS choice and compact access to its tracking policy.
 *
 * @param props - Availability, policy, selection, and change properties.
 * @returns The dependent Git LFS option.
 */
export const CreateProjectGitLfsOption: React.FC<
    CreateProjectGitLfsOptionProps
> = ({ t, available, policy, selected, onSelectedChange }) => (
    <div className="ml-6 flex items-center gap-2">
        <label
            className={
                available
                    ? 'flex items-center gap-2'
                    : 'flex items-center gap-2 text-base-content/50'
            }
        >
            <input
                type="checkbox"
                className="checkbox checkbox-sm rounded-sm"
                disabled={!available}
                checked={selected}
                onChange={(event) => onSelectedChange(event.target.checked)}
            />
            <span>{t('otherSettings.gitLfs.label')}</span>
        </label>
        {available && policy && (
            <TooltipIconButton
                label={t('otherSettings.gitLfs.patternsTitle')}
                placement="right"
                delay={150}
                tip={
                    <div className="flex max-w-80 flex-col gap-2 p-2 text-left">
                        <p className="font-semibold">
                            {t('otherSettings.gitLfs.patternsTitle')}
                        </p>
                        {policy.groups.map((group) => (
                            <p key={group.id}>
                                <span className="font-medium">
                                    {t(
                                        `otherSettings.gitLfs.groups.${group.id}`,
                                    )}
                                    :{' '}
                                </span>
                                <code className="break-words">
                                    {group.patterns.join(' ')}
                                </code>
                            </p>
                        ))}
                        <p className="opacity-80">
                            {t('otherSettings.gitLfs.storageAndBandwidth')}
                        </p>
                    </div>
                }
                className="text-base-content/60 hover:text-base-content"
            >
                <CircleHelp className="size-4" aria-hidden="true" />
            </TooltipIconButton>
        )}
        {!available && (
            <CreateProjectUnavailableStatus
                label={t('otherSettings.unavailableLabel')}
                help={t('otherSettings.gitLfs.unavailable')}
            />
        )}
    </div>
);
