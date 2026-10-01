import type {
    EditorRemovalOutcome,
    EditorRemovalSelection,
    ProjectDetails,
    RemoveEditorsResult,
} from '@shared/contracts';
import { useRef, useState } from 'react';
import type { ConfirmLayout } from '../../../components/confirm.component';
import {
    getEditorProjectUsageCount,
    getReleaseActionKey,
} from '../installs-view.model';

type RemoveEditorsConfirmProps = {
    selections: EditorRemovalSelection[];
    projects: ProjectDetails[];
    t: (key: string, options?: Record<string, unknown>) => string;
    onRemove: (
        selections: EditorRemovalSelection[],
    ) => Promise<RemoveEditorsResult>;
    close: () => void;
    renderLayout: ConfirmLayout;
};

/**
 * Confirms the batch once and keeps failed removals available for retry.
 *
 * @param props - Selected editors, project usage, removal action and dialog layout.
 * @returns The batch removal confirmation.
 */
export function RemoveEditorsConfirm({
    selections,
    projects,
    t,
    onRemove,
    close,
    renderLayout,
}: RemoveEditorsConfirmProps) {
    const [pending, setPending] = useState(false);
    const [outcomes, setOutcomes] = useState<EditorRemovalOutcome[]>([]);
    const [error, setError] = useState<string>();
    const pendingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const outcomeByKey = new Map(
        outcomes.map((outcome) => [
            getReleaseActionKey(outcome.release),
            outcome,
        ]),
    );
    const retrySelections = selections.filter(
        ({ release }) =>
            outcomeByKey.get(getReleaseActionKey(release))?.status === 'failed',
    );
    const finished = outcomes.length > 0;
    const removable = finished ? retrySelections : selections;
    const managedCount = selections.filter(
        ({ release }) =>
            release.source !== 'custom' &&
            release.managed_by_launcher !== false,
    ).length;
    const customCount = selections.length - managedCount;

    /** Removes the initial selection or retries only failed editors. */
    const remove = async () => {
        if (pendingRef.current || removable.length === 0) return;
        pendingRef.current = true;
        setPending(true);
        setError(undefined);
        try {
            const result = await onRemove(removable);
            setOutcomes((previous) => {
                const updated = new Map(
                    previous.map((outcome) => [
                        getReleaseActionKey(outcome.release),
                        outcome,
                    ]),
                );
                for (const outcome of result.outcomes) {
                    updated.set(getReleaseActionKey(outcome.release), outcome);
                }
                return [...updated.values()];
            });
            if (
                result.outcomes.every((outcome) => outcome.status === 'removed')
            ) {
                close();
            }
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : t('selection.errors.failed'),
            );
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return renderLayout(
        <div className="flex flex-col gap-3">
            <p className="font-semibold">
                {t('selection.confirm.message', { count: selections.length })}
            </p>
            {managedCount > 0 && (
                <p className="text-base-content/75">
                    {t('selection.confirm.managed', { count: managedCount })}
                </p>
            )}
            {customCount > 0 && (
                <p className="text-base-content/75">
                    {t('selection.confirm.custom', { count: customCount })}
                </p>
            )}
            <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
                {selections.map(({ release }) => {
                    const key = getReleaseActionKey(release);
                    const outcome = outcomeByKey.get(key);
                    const usageCount = getEditorProjectUsageCount(
                        release,
                        projects,
                    );
                    const affectedProjects = projects.filter(
                        (project) =>
                            getEditorProjectUsageCount(release, [project]) > 0,
                    );
                    return (
                        <li
                            key={key}
                            className="rounded-md bg-base-content/5 px-3 py-2"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold break-words">
                                    {release.name ?? release.version}
                                    {release.mono && (
                                        <span className="ml-2 badge badge-sm badge-outline">
                                            .NET
                                        </span>
                                    )}
                                </span>
                                {outcome && (
                                    <span
                                        className={
                                            outcome.status === 'removed'
                                                ? 'text-success'
                                                : 'text-warning'
                                        }
                                    >
                                        {t(
                                            `selection.results.${outcome.status}`,
                                        )}
                                    </span>
                                )}
                            </div>
                            {usageCount > 0 && !outcome && (
                                <p className="mt-1 text-warning">
                                    {t('selection.confirm.used', {
                                        names: affectedProjects
                                            .map((project) => project.name)
                                            .join(', '),
                                    })}
                                </p>
                            )}
                            {outcome?.error && (
                                <p className="mt-1 break-words text-base-content/75">
                                    {outcome.error}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
            {pending && (
                <p
                    role="status"
                    className="flex items-center gap-2 text-base-content/75"
                >
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                    {t('selection.removing')}
                </p>
            )}
            {error && (
                <p role="alert" className="text-error">
                    {error}
                </p>
            )}
        </div>,
        <>
            <button
                ref={cancelRef}
                type="button"
                className="btn btn-ghost text-base"
                disabled={pending}
                onClick={close}
            >
                {t(finished ? 'selection.done' : 'common:buttons.cancel')}
            </button>
            {removable.length > 0 && (
                <button
                    type="button"
                    className="btn btn-error text-base"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() => void remove()}
                >
                    {t(
                        finished ? 'selection.retryFailed' : 'selection.remove',
                        { count: removable.length },
                    )}
                </button>
            )}
        </>,
        {
            initialFocusRef: cancelRef,
            onRequestClose: () => {
                if (!pendingRef.current) close();
            },
        },
    );
}
