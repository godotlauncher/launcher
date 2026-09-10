import type {
    ProjectDetails,
    ProjectGitIdentityResult,
} from '@shared/contracts';
import { CircleCheck, GitBranch } from 'lucide-react';
import type React from 'react';
import { ContentDivider } from '../../../../components/ui/content-divider.component';
import { CopyButton } from '../../../../components/ui/copy-button.component';
import { TextField } from '../../../../components/ui/text-field.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ProjectSettingsSourceControlSectionProps = {
    t: Translate;
    project: ProjectDetails;
    withGit: boolean;
    gitAvailable: boolean;
    loadingGitAvailability: boolean;
    isInitializingGit: boolean;
    gitIdentity: ProjectGitIdentityResult | null;
    loadingGitIdentity: boolean;
    editingGitIdentity: boolean;
    gitIdentityName: string;
    gitIdentityEmail: string;
    savingGitIdentity: boolean;
    gitIdentityError: string | undefined;
    gitUnavailable: boolean;
    disabled: boolean;
    onInitializeGit: () => void;
    onEditGitIdentity: () => void;
    onSaveGitIdentity: () => void;
    onCancelGitIdentity: () => void;
    onGitIdentityNameChange: (value: string) => void;
    onGitIdentityEmailChange: (value: string) => void;
};

/**
 * Renders the Source Control tab of the project settings drawer.
 *
 * @param props - Git state, actions, and translation function.
 * @returns The Source Control section.
 */
export const ProjectSettingsSourceControlSection: React.FC<
    ProjectSettingsSourceControlSectionProps
> = ({
    t,
    project,
    withGit,
    gitAvailable,
    loadingGitAvailability,
    isInitializingGit,
    gitIdentity,
    loadingGitIdentity,
    editingGitIdentity,
    gitIdentityName,
    gitIdentityEmail,
    savingGitIdentity,
    gitIdentityError,
    gitUnavailable,
    disabled,
    onInitializeGit,
    onEditGitIdentity,
    onSaveGitIdentity,
    onCancelGitIdentity,
    onGitIdentityNameChange,
    onGitIdentityEmailChange,
}) => (
    <section className="flex flex-col gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
            <h2 className="text-base font-semibold">
                {t('editProject.sourceControl.title')}
            </h2>
            <p className="break-words text-base-content/75">
                {t('editProject.sourceControl.help')}
            </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md bg-base-200/40 p-4">
            <div className="flex min-w-0 items-start gap-3">
                <GitBranch className="size-5 shrink-0" aria-hidden="true" />
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold">Git</span>
                    <span className="text-base-content/75">
                        {t(
                            withGit
                                ? gitUnavailable
                                    ? 'editProject.sourceControl.enabledUnavailable'
                                    : 'editProject.sourceControl.enabled'
                                : 'editProject.sourceControl.notConfigured',
                        )}
                    </span>
                    {!withGit && !loadingGitAvailability && !gitAvailable && (
                        <span className="text-warning">
                            {t('createProject:otherSettings.gitNotInstalled')}
                        </span>
                    )}
                </div>
            </div>
            {gitUnavailable ? (
                <span
                    className="badge badge-sm badge-soft badge-warning text-warning-content dark:text-warning"
                    data-testid="projectGitUnavailable"
                >
                    {t('editProject.sourceControl.identityUnavailable')}
                </span>
            ) : withGit ? (
                <span
                    className="badge badge-sm badge-soft badge-success text-success-content dark:text-success gap-1.5"
                    data-testid="projectGitActive"
                >
                    <CircleCheck className="h-4 w-4" aria-hidden="true" />
                    {t('editProject.sourceControl.active')}
                </span>
            ) : loadingGitAvailability ? (
                <span className="loading loading-spinner loading-sm" />
            ) : gitAvailable ? (
                <button
                    type="button"
                    className="btn btn-primary shrink-0 text-base"
                    disabled={!project.valid || disabled || isInitializingGit}
                    onClick={onInitializeGit}
                >
                    {isInitializingGit && (
                        <span className="loading loading-spinner loading-xs" />
                    )}
                    {t(
                        isInitializingGit
                            ? 'editProject.sourceControl.initializing'
                            : 'editProject.sourceControl.initialize',
                    )}
                </button>
            ) : null}
        </div>
        {withGit && <ContentDivider />}
        {withGit && loadingGitIdentity && (
            <div className="flex justify-center py-4">
                <span className="loading loading-spinner loading-sm" />
            </div>
        )}
        {withGit && gitIdentity?.status === 'available' && (
            <div className="flex flex-col gap-[12px]">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-[4px]">
                        <h3 className="text-base font-semibold">
                            {t('editProject.sourceControl.identityTitle')}
                        </h3>
                        <p className="break-words text-base-content/75">
                            {t('editProject.sourceControl.identityHelp')}
                        </p>
                    </div>
                    {!editingGitIdentity && gitIdentity.canUpdate && (
                        <button
                            type="button"
                            className="btn btn-ghost shrink-0 text-base"
                            disabled={disabled}
                            onClick={onEditGitIdentity}
                        >
                            {t('editProject.sourceControl.updateIdentity')}
                        </button>
                    )}
                </div>
                {editingGitIdentity ? (
                    <div className="flex flex-col gap-3">
                        <TextField
                            id="projectGitIdentityName"
                            label={t('editProject.sourceControl.identityName')}
                            help={t(
                                'editProject.sourceControl.identityNameHelp',
                            )}
                            value={gitIdentityName}
                            onChange={onGitIdentityNameChange}
                            disabled={savingGitIdentity || disabled}
                        />
                        <TextField
                            id="projectGitIdentityEmail"
                            label={t('editProject.sourceControl.identityEmail')}
                            help={t(
                                'editProject.sourceControl.identityEmailHelp',
                            )}
                            value={gitIdentityEmail}
                            onChange={onGitIdentityEmailChange}
                            disabled={savingGitIdentity || disabled}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="btn btn-ghost text-base"
                                disabled={savingGitIdentity || disabled}
                                onClick={onCancelGitIdentity}
                            >
                                {t('common:buttons.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary shrink-0 text-base"
                                disabled={savingGitIdentity || disabled}
                                onClick={onSaveGitIdentity}
                            >
                                {savingGitIdentity && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {t('editProject.sourceControl.saveIdentity')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <dl className="grid gap-3">
                        {(
                            [
                                ['identityName', gitIdentity.name],
                                ['identityEmail', gitIdentity.email],
                            ] as const
                        ).map(([label, value]) => (
                            <div key={label} className="min-w-0">
                                <dt className="flex flex-wrap items-center gap-2 text-base-content/75">
                                    <span>
                                        {t(
                                            `editProject.sourceControl.${label}`,
                                        )}
                                    </span>
                                    <span className="badge badge-sm badge-soft capitalize">
                                        {t(
                                            `editProject.sourceControl.identitySource.${value.source}`,
                                        )}
                                    </span>
                                </dt>
                                <dd className="mt-1 flex min-w-0 items-center gap-2 rounded-md bg-base-content/5 px-3 py-2">
                                    <span className="min-w-0 flex-1 break-all select-text">
                                        {value.value ||
                                            t(
                                                'editProject.sourceControl.identityMissing',
                                            )}
                                    </span>
                                    {value.value && (
                                        <div className="shrink-0">
                                            <CopyButton value={value.value} />
                                        </div>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {!gitIdentity.canUpdate && (
                    <p className="break-words text-base-content/75">
                        {t(
                            gitIdentity.repository.kind === 'linked-worktree'
                                ? 'editProject.sourceControl.linkedWorktreeReadOnly'
                                : 'editProject.sourceControl.parentRepositoryReadOnly',
                            { root: gitIdentity.repository.root },
                        )}
                    </p>
                )}
            </div>
        )}
        {withGit && gitIdentity?.status === 'git-unavailable' && (
            <div className="flex flex-col gap-[12px]">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-[4px]">
                        <h3 className="text-base font-semibold">
                            {t('editProject.sourceControl.identityTitle')}
                        </h3>
                        <p className="break-words text-base-content/75">
                            {t(
                                'editProject.sourceControl.identityUnavailableHelp',
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost shrink-0 text-base"
                        disabled
                    >
                        {t('editProject.sourceControl.updateIdentity')}
                    </button>
                </div>
                <dl className="grid gap-3">
                    {['identityName', 'identityEmail'].map((label) => (
                        <div key={label} className="min-w-0">
                            <dt className="text-base-content/75">
                                {t(`editProject.sourceControl.${label}`)}
                            </dt>
                            <dd className="mt-1 rounded-md bg-base-content/5 px-3 py-2 text-base-content/60">
                                {t(
                                    'editProject.sourceControl.identityUnavailable',
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>
        )}
        {gitIdentityError && (
            <p className="break-words text-error" role="alert">
                {gitIdentityError}
            </p>
        )}
    </section>
);
