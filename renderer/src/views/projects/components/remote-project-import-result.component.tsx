import type { TFunction } from 'i18next';
import {
    ArrowRight,
    Check,
    CircleCheck,
    CircleMinus,
    FileCode,
    TriangleAlert,
} from 'lucide-react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { getProjectDirectoryFromFilePath } from '../remote-project-import.model';
import type { RemoteProjectRegistrationOutcome } from '../remote-project-import.types';

type RemoteProjectRegistrationResultProps = {
    outcomes: RemoteProjectRegistrationOutcome[];
    editorDownloadsQueued: boolean;
    cloneRecoveryError: string | null;
    t: TFunction;
};

/** Renders the final per-project registration outcomes. */
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
                <p className="text-sm text-base-content/70">
                    {t('addProject.remote.registration.preserved')}
                </p>
            </div>
            {editorDownloadsQueued && (
                <div className="alert alert-info alert-soft">
                    <Check aria-hidden="true" size={18} />
                    <span>
                        {t('addProject.remote.registration.editorsQueued')}
                    </span>
                </div>
            )}
            <ul className="min-h-0 overflow-auto rounded-lg border border-base-300">
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
                            ? 'text-success'
                            : outcome.status === 'skipped'
                              ? 'text-warning'
                              : 'text-error';

                    return (
                        <li
                            key={outcome.project.projectFilePath}
                            className="grid min-h-[72px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-base-300 px-4 py-3 last:border-b-0"
                        >
                            <span className="grid size-10 place-items-center rounded-md bg-base-200 text-base-content/65">
                                <FileCode
                                    size={23}
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="flex min-w-0 flex-col gap-1">
                                <span
                                    className="flex min-w-0 items-center gap-2 text-base leading-5"
                                    aria-hidden={renamed || undefined}
                                >
                                    <span
                                        className={
                                            renamed
                                                ? 'truncate text-base-content/65'
                                                : 'truncate font-semibold text-base-content'
                                        }
                                        title={outcome.originalName}
                                    >
                                        {outcome.originalName}
                                    </span>
                                    {renamed && (
                                        <>
                                            <ArrowRight
                                                size={16}
                                                className="shrink-0 text-base-content/40"
                                                aria-hidden="true"
                                            />
                                            <span
                                                className="truncate font-semibold text-base-content"
                                                title={outcome.launcherName}
                                            >
                                                {outcome.launcherName}
                                            </span>
                                            <span className="badge badge-ghost badge-sm shrink-0 rounded-md font-normal text-base-content/55">
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
                                    className="self-start rounded-md bg-transparent px-0 shadow-none hover:bg-transparent hover:text-base-content/70"
                                />
                            </span>
                            <span className="flex max-w-80 items-center justify-end gap-2">
                                {outcome.status !== 'added' && (
                                    <span
                                        className={`text-right text-sm leading-5 ${statusClassName}`}
                                    >
                                        {statusLabel}: {outcome.error}
                                    </span>
                                )}
                                <Tooltip
                                    tip={statusLabel}
                                    placement="top"
                                    role={
                                        outcome.status === 'added'
                                            ? 'img'
                                            : undefined
                                    }
                                    ariaLabel={
                                        outcome.status === 'added'
                                            ? statusLabel
                                            : undefined
                                    }
                                    className={`size-6 shrink-0 items-center justify-center ${statusClassName}`}
                                >
                                    <StatusIcon
                                        size={20}
                                        strokeWidth={2.2}
                                        aria-hidden="true"
                                    />
                                </Tooltip>
                            </span>
                        </li>
                    );
                })}
            </ul>
            {cloneRecoveryError && (
                <div className="alert alert-error alert-soft" role="alert">
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

/** Renders a terminal import failure and preserved clone information. */
export function RemoteProjectImportFailure({
    failure,
    clonePreservedPath,
    destinationDisplay,
    cloneRecoveryError,
    t,
}: RemoteProjectImportFailureProps) {
    return (
        <div className="flex flex-col gap-4">
            <div
                className={`alert ${clonePreservedPath ? 'alert-warning' : 'alert-error'} alert-soft`}
                role="alert"
            >
                <TriangleAlert aria-hidden="true" size={18} />
                <span>{failure ? t(failure) : ''}</span>
            </div>
            {clonePreservedPath && (
                <p>{t('addProject.remote.registration.preserved')}</p>
            )}
            <code className="break-all rounded-box bg-base-200 p-3">
                {clonePreservedPath ?? destinationDisplay}
            </code>
            {cloneRecoveryError && (
                <div className="alert alert-error alert-soft" role="alert">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{t(cloneRecoveryError)}</span>
                </div>
            )}
        </div>
    );
}
