import type { TFunction } from 'i18next';
import {
    ArrowRight,
    Check,
    CircleCheck,
    CircleMinus,
    FileCode,
    TriangleAlert,
} from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { CopyButton } from '../../../components/ui/copy-button.component';
import { getProjectDirectoryFromFilePath } from '../remote-project-import.model';
import type { RemoteProjectRegistrationOutcome } from '../remote-project-import.types';

type RemoteProjectRegistrationResultProps = {
    outcomes: RemoteProjectRegistrationOutcome[];
    editorDownloadsQueued: boolean;
    cloneRecoveryError: string | null;
    t: TFunction;
};

/**
 * Renders the final per-project registration outcomes.
 * @param props - Project outcomes, download and recovery state, and translations.
 */
export function RemoteProjectRegistrationResult({
    outcomes,
    editorDownloadsQueued,
    cloneRecoveryError,
    t,
}: RemoteProjectRegistrationResultProps) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
                <h2 className="text-base font-semibold">
                    {t('addProject.remote.registration.complete')}
                </h2>
                <p className="text-base text-base-content/75">
                    {t('addProject.remote.registration.preserved')}
                </p>
            </div>
            {editorDownloadsQueued && (
                <div className="alert alert-info alert-soft text-base text-info-content dark:text-info">
                    <Check aria-hidden="true" size={18} />
                    <span>
                        {t('addProject.remote.registration.editorsQueued')}
                    </span>
                </div>
            )}
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-3 [scrollbar-gutter:stable]">
                {outcomes.map((outcome) => {
                    const renamed =
                        outcome.originalName !== outcome.launcherName;
                    const statusLabel = t(
                        `addProject.remote.registration.${outcome.status}`,
                    );
                    const StatusIcon =
                        outcome.status === 'added'
                            ? CircleCheck
                            : outcome.status === 'skipped'
                              ? CircleMinus
                              : TriangleAlert;
                    const statusClassName =
                        outcome.status === 'added'
                            ? 'text-success-content dark:text-success'
                            : outcome.status === 'skipped'
                              ? 'text-base-content/60'
                              : 'text-error-content dark:text-error';

                    return (
                        <li
                            key={outcome.project.projectFilePath}
                            className="grid min-h-[72px] shrink-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-md bg-base-content/2 px-3 py-3 hover:bg-base-content/5"
                        >
                            <span className="grid size-10 place-items-center rounded-md bg-base-200/60">
                                <FileCode size={20} aria-hidden="true" />
                            </span>
                            <span className="flex min-w-0 flex-col gap-1">
                                <span
                                    className="flex min-w-0 items-center gap-2"
                                    aria-hidden={renamed || undefined}
                                >
                                    <span
                                        className={
                                            renamed
                                                ? 'truncate text-base-content/60'
                                                : 'truncate font-semibold'
                                        }
                                        title={outcome.originalName}
                                    >
                                        {outcome.originalName}
                                    </span>
                                    {renamed && (
                                        <>
                                            <ArrowRight
                                                size={16}
                                                className="shrink-0"
                                                aria-hidden="true"
                                            />
                                            <span
                                                className="truncate font-semibold"
                                                title={outcome.launcherName}
                                            >
                                                {outcome.launcherName}
                                            </span>
                                            <span className="badge badge-sm badge-ghost shrink-0">
                                                {t(
                                                    'addProject.remote.registration.renamed',
                                                )}
                                            </span>
                                        </>
                                    )}
                                </span>
                                {renamed && (
                                    <span className="sr-only">
                                        {t(
                                            'addProject.remote.registration.renamedFromTo',
                                            {
                                                original: outcome.originalName,
                                                final: outcome.launcherName,
                                            },
                                        )}
                                    </span>
                                )}
                                <CopyBadge
                                    value={getProjectDirectoryFromFilePath(
                                        outcome.project.projectFilePath,
                                    )}
                                    label={t('common:buttons.copyPath')}
                                    copiedLabel={t('common:success')}
                                    className="self-start"
                                />
                                <span
                                    className={`flex items-start gap-2 ${statusClassName}`}
                                >
                                    <StatusIcon
                                        size={16}
                                        className="mt-0.5 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <span>
                                        {statusLabel}
                                        {outcome.error
                                            ? `: ${outcome.error}`
                                            : ''}
                                    </span>
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            {cloneRecoveryError && (
                <div
                    className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                    role="alert"
                >
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{t(cloneRecoveryError)}</span>
                </div>
            )}
        </div>
    );
}

type RemoteProjectImportFailureProps = {
    failure: string | null;
    clonePreservedPath: string | null;
    destinationDisplay: string;
    cloneRecoveryError: string | null;
    t: TFunction;
};

/**
 * Renders a terminal import failure and preserved clone information.
 * @param props - Failure, clone location, recovery state and translations.
 */
export function RemoteProjectImportFailure({
    failure,
    clonePreservedPath,
    destinationDisplay,
    cloneRecoveryError,
    t,
}: RemoteProjectImportFailureProps) {
    return (
        <div className="flex flex-col gap-4">
            <p className="text-base" role="alert">
                {failure ? t(failure) : ''}
            </p>
            {clonePreservedPath && (
                <p className="text-sm text-base-content/60">
                    {t('addProject.remote.registration.cloneKeptAt')}
                </p>
            )}
            <div className="flex items-center gap-2 rounded-box bg-base-200/60 p-3">
                <code className="min-w-0 flex-1 select-none break-all font-mono text-sm">
                    {clonePreservedPath ?? destinationDisplay}
                </code>
                <div className="shrink-0">
                    <CopyButton
                        value={clonePreservedPath ?? destinationDisplay}
                    />
                </div>
            </div>
            {cloneRecoveryError && (
                <div
                    className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                    role="alert"
                >
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{t(cloneRecoveryError)}</span>
                </div>
            )}
        </div>
    );
}
