import type { TFunction } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import type { RefObject } from 'react';
import { getRemoteProjectSubmoduleActivityMessage } from '../remote-project-import.messages';
import type { RemoteProjectSubmoduleActivityEntry } from '../remote-project-import.types';

type RemoteProjectSubmodulesProps = {
    initialising: boolean;
    failure: string | null;
    activities: RemoteProjectSubmoduleActivityEntry[];
    t: TFunction;
};

/**
 * Renders submodule confirmation, progress, and activity history.
 *
 * @param props - Current submodule state and translations.
 * @returns Submodule workflow content.
 */
export function RemoteProjectSubmodules({
    initialising,
    failure,
    activities,
    t,
}: RemoteProjectSubmodulesProps) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">
                    {t('addProject.remote.submodules.title')}
                </h2>
                <p className="max-w-4xl text-sm text-base-content/70">
                    {t('addProject.remote.submodules.description')}
                </p>
            </div>
            {failure && (
                <div className="alert alert-error alert-soft" role="alert">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{t('addProject.remote.submodules.failure')}</span>
                </div>
            )}
            {initialising && activities.length === 0 && (
                <div className="flex items-center gap-2" role="status">
                    <span className="loading loading-spinner loading-sm" />
                    {t('addProject.remote.submodules.preparing')}
                </div>
            )}
            {activities.length > 0 && (
                <div className="flex min-h-0 flex-col gap-2">
                    <p className="font-medium">
                        {t('addProject.remote.submodules.activityTitle')}
                    </p>
                    <ol
                        className="max-h-64 space-y-2 overflow-auto rounded-box border border-base-300 bg-base-200 p-3 text-sm"
                        aria-live="polite"
                        aria-label={t(
                            'addProject.remote.submodules.activityAriaLabel',
                        )}
                    >
                        {activities.map((entry) => (
                            <li key={entry.id} className="break-all font-mono">
                                {getRemoteProjectSubmoduleActivityMessage(
                                    entry.activity,
                                    t,
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}

type RemoteProjectSubmodulesFooterProps = {
    initialising: boolean;
    canCancel: boolean;
    initialiseButtonRef: RefObject<HTMLButtonElement | null>;
    t: TFunction;
    onCancel: () => void;
    onContinueWithoutSubmodules: () => void;
    onInitialise: () => void;
};

/**
 * Renders submodule workflow actions.
 *
 * @param props - Submodule state, focus target, and actions.
 * @returns Submodule footer actions.
 */
export function RemoteProjectSubmodulesFooter({
    initialising,
    canCancel,
    initialiseButtonRef,
    t,
    onCancel,
    onContinueWithoutSubmodules,
    onInitialise,
}: RemoteProjectSubmodulesFooterProps) {
    if (initialising) {
        return canCancel ? (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
                {t('addProject.remote.actions.cancelImport')}
            </button>
        ) : null;
    }

    return (
        <div className="flex w-full items-center justify-between gap-4">
            <button
                type="button"
                data-testid="btnContinueWithoutSubmodules"
                className="btn btn-ghost"
                onClick={onContinueWithoutSubmodules}
            >
                {t('addProject.remote.submodules.continueWithoutSubmodules')}
            </button>
            <button
                ref={initialiseButtonRef}
                type="button"
                data-testid="btnInitialiseSubmodules"
                className="btn btn-primary"
                onClick={onInitialise}
            >
                {t('addProject.remote.submodules.initialise')}
            </button>
        </div>
    );
}
