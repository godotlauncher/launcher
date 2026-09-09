import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';
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
 * Renders the Git LFS choice and access to its tracking policy.
 *
 * @param props - Availability, policy, selection, and change properties.
 * @returns The dependent Git LFS option.
 */
export const CreateProjectGitLfsOption: React.FC<
    CreateProjectGitLfsOptionProps
> = ({ t, available, policy, selected, onSelectedChange }) => (
    <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
            <input
                type="checkbox"
                className="checkbox checkbox-sm shrink-0"
                disabled={!available}
                checked={selected}
                onChange={(event) => onSelectedChange(event.target.checked)}
            />
            <span className={!available ? 'text-base-content/50' : undefined}>
                {t('otherSettings.gitLfs.label')}
            </span>
        </label>
        {available && policy && (
            <HelpTooltip
                help={t('otherSettings.gitLfs.patternsTitle')}
                content={
                    <div className="flex max-w-80 flex-col gap-2 p-2 text-left">
                        <p className="font-semibold">
                            {t('otherSettings.gitLfs.patternsTitle')}
                        </p>
                        {policy.groups.map((group) => (
                            <p key={group.id}>
                                <span>
                                    {t(
                                        `otherSettings.gitLfs.groups.${group.id}`,
                                    )}
                                    :{' '}
                                </span>
                                <code className="break-words font-mono text-sm">
                                    {group.patterns.join(' ')}
                                </code>
                            </p>
                        ))}
                        <p className="mt-2">
                            {t('otherSettings.gitLfs.storageAndBandwidth')}
                        </p>
                    </div>
                }
            />
        )}
        {!available && (
            <CreateProjectUnavailableStatus
                label={t('otherSettings.unavailableLabel')}
                help={t('otherSettings.gitLfs.unavailable')}
            />
        )}
    </div>
);
