import type { TFunction } from 'i18next';
import { Check, CircleMinus, TriangleAlert } from 'lucide-react';
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
                <p className="font-medium">
                    {t('addProject.remote.registration.complete')}
                </p>
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
            <div className="min-h-0 overflow-auto rounded-box border border-base-300">
                {outcomes.map((outcome) => (
                    <div
                        key={outcome.project.projectFilePath}
                        className="flex items-start gap-3 border-b border-base-300 px-4 py-3 last:border-b-0"
                    >
                        {outcome.status === 'added' ? (
                            <Check className="mt-0.5 h-5 w-5 shrink-0 stroke-success" />
                        ) : outcome.status === 'skipped' ? (
                            <CircleMinus className="mt-0.5 h-5 w-5 shrink-0 stroke-warning" />
                        ) : (
                            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 stroke-error" />
                        )}
                        <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                                {outcome.project.name}
                            </span>
                            <code className="block truncate text-xs text-base-content/60">
                                {outcome.project.relativePath}
                            </code>
                            <span className="text-sm text-base-content/70">
                                {t(
                                    `addProject.remote.registration.${outcome.status}`,
                                )}
                                {outcome.error ? `: ${outcome.error}` : ''}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
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
