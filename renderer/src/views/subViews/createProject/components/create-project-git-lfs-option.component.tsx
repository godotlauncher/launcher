import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { CircleHelp } from 'lucide-react';
import type React from 'react';
import { Tooltip } from '../../../../components/ui/tooltip.component';

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
    <div className="ml-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    disabled={!available}
                    checked={selected}
                    onChange={(event) => onSelectedChange(event.target.checked)}
                />
                <span>{t('otherSettings.gitLfs.label')}</span>
            </label>
            {policy && (
                <Tooltip
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
                >
                    <button
                        type="button"
                        className="btn btn-circle btn-ghost btn-xs text-base-content/60 hover:text-base-content"
                        aria-label={t('otherSettings.gitLfs.patternsTitle')}
                    >
                        <CircleHelp className="size-4" aria-hidden="true" />
                    </button>
                </Tooltip>
            )}
        </div>
        {!available && (
            <p className="text-sm text-warning">
                {t('otherSettings.gitLfs.unavailable')}
            </p>
        )}
    </div>
);
