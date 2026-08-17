import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import clsx from 'clsx';
import type React from 'react';
import { CreateProjectGitLfsOption } from './create-project-git-lfs-option.component';

type Translate = (key: string) => string;

type CreateProjectSourceControlSectionProps = {
    t: Translate;
    loading: boolean;
    gitAvailable: boolean;
    gitLfsAvailable: boolean;
    gitLfsPolicy: GitLfsTrackingPolicyDescriptor | null;
    withGit: boolean;
    withGitLfs: boolean;
    onWithGitChange: (enabled: boolean) => void;
    onWithGitLfsChange: (enabled: boolean) => void;
};

/**
 * Renders Create Project source-control choices.
 *
 * @param props - Loading, availability, selection, and change properties.
 * @returns The Git and dependent Git LFS controls.
 */
export const CreateProjectSourceControlSection: React.FC<
    CreateProjectSourceControlSectionProps
> = ({
    t,
    loading,
    gitAvailable,
    gitLfsAvailable,
    gitLfsPolicy,
    withGit,
    withGitLfs,
    onWithGitChange,
    onWithGitLfsChange,
}) => (
    <div className="flex flex-col gap-2">
        <h2 className="text-md flex items-center gap-4">
            {t('projects:editProject.sourceControl.title')}
            {loading && (
                <span className="loading loading-dots loading-xs"></span>
            )}
        </h2>
        <div
            className={clsx('flex flex-col gap-4 py-2', {
                invisible: loading,
            })}
        >
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    className="checkbox"
                    disabled={!gitAvailable}
                    checked={withGit}
                    onChange={(event) => onWithGitChange(event.target.checked)}
                />
                <span>{t('otherSettings.initGit')}</span>
            </label>
            {!gitAvailable && (
                <span className="text-sm text-warning">
                    {t('otherSettings.gitNotInstalled')}
                </span>
            )}
            {withGit && (
                <CreateProjectGitLfsOption
                    t={t}
                    available={gitLfsAvailable}
                    policy={gitLfsPolicy}
                    selected={withGitLfs}
                    onSelectedChange={onWithGitLfsChange}
                />
            )}
        </div>
    </div>
);
