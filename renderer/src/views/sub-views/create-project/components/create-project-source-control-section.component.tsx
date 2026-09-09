import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import clsx from 'clsx';
import { LockKeyhole } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';
import { CreateProjectGitLfsOption } from './create-project-git-lfs-option.component';
import { CreateProjectUnavailableStatus } from './create-project-unavailable-status.component';

type Translate = (key: string) => string;

type CreateProjectSourceControlSectionProps = {
    t: Translate;
    loading: boolean;
    gitAvailable: boolean;
    gitLfsAvailable: boolean;
    gitLfsPolicy: GitLfsTrackingPolicyDescriptor | null;
    withGit: boolean;
    withGitLfs: boolean;
    publishToGitHub: boolean;
    publishingLocked?: boolean;
    onWithGitChange: (enabled: boolean) => void;
    onWithGitLfsChange: (enabled: boolean) => void;
    onPublishToGitHubChange: (enabled: boolean) => void;
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
    publishToGitHub,
    publishingLocked = false,
    onWithGitChange,
    onWithGitLfsChange,
    onPublishToGitHubChange,
}) => (
    <div className="flex flex-col gap-2 text-base" aria-busy={loading}>
        <h2 className="flex items-center gap-4 text-base font-semibold">
            {t('projects:editProject.sourceControl.title')}
            {loading && (
                <span
                    role="status"
                    aria-label={t('common:app.loadingMessage')}
                    className="text-base-content/75"
                >
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                </span>
            )}
        </h2>
        <div
            className={clsx('grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2', {
                invisible: loading,
            })}
        >
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm shrink-0"
                        disabled={!gitAvailable}
                        checked={withGit}
                        onChange={(event) =>
                            onWithGitChange(event.target.checked)
                        }
                    />
                    <span
                        className={
                            !gitAvailable ? 'text-base-content/50' : undefined
                        }
                    >
                        {t('otherSettings.initGit')}
                    </span>
                </label>
                {!gitAvailable && (
                    <CreateProjectUnavailableStatus
                        label={t('otherSettings.unavailableLabel')}
                        help={t('otherSettings.gitNotInstalled')}
                    />
                )}
            </div>
            {withGit && (
                <>
                    <CreateProjectGitLfsOption
                        t={t}
                        available={gitLfsAvailable}
                        policy={gitLfsPolicy}
                        selected={withGitLfs}
                        onSelectedChange={onWithGitLfsChange}
                    />
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm shrink-0"
                                checked={publishToGitHub}
                                disabled={publishingLocked}
                                onChange={(event) =>
                                    onPublishToGitHubChange(
                                        event.target.checked,
                                    )
                                }
                            />
                            <span>{t('publishToGitHub.label')}</span>
                        </label>
                        {publishToGitHub && (
                            <HelpTooltip
                                help={t('publishToGitHub.repositoryTitle')}
                                icon={LockKeyhole}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    </div>
);
