import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import type React from 'react';

type Translate = (key: string) => string;

type CreateProjectGitLfsOptionProps = {
    t: Translate;
    available: boolean;
    policy: GitLfsTrackingPolicyDescriptor | null;
    selected: boolean;
    onSelectedChange: (selected: boolean) => void;
};

/**
 * Renders the Git LFS choice and the main-owned tracking policy description.
 *
 * @param props - Availability, policy, selection, and change properties.
 * @returns The dependent Git LFS option.
 */
export const CreateProjectGitLfsOption: React.FC<
    CreateProjectGitLfsOptionProps
> = ({ t, available, policy, selected, onSelectedChange }) => (
    <div className="ml-6 flex flex-col gap-2">
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
        <p className="text-sm opacity-70">
            {t('otherSettings.gitLfs.description')}
        </p>
        {!available && (
            <p className="text-sm text-warning">
                {t('otherSettings.gitLfs.unavailable')}
            </p>
        )}
        {selected && policy && (
            <div className="rounded-box bg-base-200 flex flex-col gap-2 p-3 text-sm">
                <p className="font-medium">
                    {t('otherSettings.gitLfs.patternsTitle')}
                </p>
                {policy.groups.map((group) => (
                    <p key={group.id}>
                        <span className="font-medium">
                            {t(`otherSettings.gitLfs.groups.${group.id}`)}:{' '}
                        </span>
                        <code>{group.patterns.join(' ')}</code>
                    </p>
                ))}
                <p className="opacity-70">
                    {t('otherSettings.gitLfs.storageAndBandwidth')}
                </p>
            </div>
        )}
    </div>
);
