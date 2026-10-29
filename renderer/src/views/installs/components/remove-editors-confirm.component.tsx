import type {
    CommandLineAlias,
    EditorRemovalOutcome,
    EditorRemovalSelection,
    ProjectDetails,
    RemoveEditorsResult,
} from '@shared/contracts';
import { useId, useRef, useState } from 'react';
import { Trans } from 'react-i18next';
import type { ConfirmLayout } from '../../../components/confirm.component';
import {
    getEditorProjectUsageCount,
    getReleaseActionKey,
} from '../installs-view.model';

type RemoveEditorsConfirmProps = {
    selections: EditorRemovalSelection[];
    commandLineDefaultKey?: string | null;
    commandLineAliases?: CommandLineAlias[];
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
    commandLineDefaultKey,
    commandLineAliases = [],
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
    const reviewHeadingId = useId();
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
    const selectedKeys = new Set(
        selections.map(({ release }) => getReleaseActionKey(release)),
    );
    const aliasCount = commandLineAliases.filter((alias) =>
        selectedKeys.has(getReleaseActionKey(alias)),
    ).length;
    const removesDefault = Boolean(
        commandLineDefaultKey && selectedKeys.has(commandLineDefaultKey),
    );
    const projectCount = projects.filter((project) =>
        selections.some(
            ({ release }) => getEditorProjectUsageCount(release, [project]) > 0,
        ),
    ).length;
    const problems = outcomes.filter((outcome) => outcome.status !== 'removed');

    /** Removes the initial selection or retries only failed editors. */
    const remove = async () => {
        if (pendingRef.current || removable.length === 0) return;
        pendingRef.current = true;
        setPending(true);
        setError(undefined);
        try {
            const result = await onRemove(removable);
            const updated = new Map(
                outcomes.map((outcome) => [
                    getReleaseActionKey(outcome.release),
                    outcome,
                ]),
            );
            for (const outcome of result.outcomes)
                updated.set(getReleaseActionKey(outcome.release), outcome);
            const next = [...updated.values()];
            setOutcomes(next);
            if (
                next.length === selections.length &&
                next.every((outcome) => outcome.status === 'removed')
            )
                close();
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
        <div className="flex min-h-0 flex-1 flex-col gap-5">
            {!finished ? (
                <div className="flex shrink-0 flex-col gap-3">
                    {managedCount > 0 && (
                        <p>
                            {t('selection.confirm.managedCount', {
                                count: managedCount,
                            })}
                        </p>
                    )}
                    {customCount > 0 && (
                        <p>
                            {t('selection.confirm.customCount', {
                                count: customCount,
                            })}
                        </p>
                    )}
                    {removesDefault && (
                        <p>
                            <Trans
                                ns="installs"
                                i18nKey="selection.confirm.default"
                                components={{
                                    code: (
                                        <code className="rounded bg-base-300 px-1 font-mono" />
                                    ),
                                }}
                            />
                        </p>
                    )}
                    {projectCount > 0 && (
                        <p>
                            {t('selection.confirm.projects', {
                                count: projectCount,
                            })}
                        </p>
                    )}
                    {aliasCount > 0 && (
                        <p>
                            {t('selection.confirm.aliases', {
                                count: aliasCount,
                            })}
                        </p>
                    )}
                </div>
            ) : (
                <p role="status" className="shrink-0">
                    {t('selection.confirm.completed', {
                        removed: outcomes.filter(
                            (outcome) => outcome.status === 'removed',
                        ).length,
                        failed: outcomes.filter(
                            (outcome) => outcome.status === 'failed',
                        ).length,
                        skipped: outcomes.filter(
                            (outcome) => outcome.status === 'skipped',
                        ).length,
                    })}
                </p>
            )}
            <section
                aria-labelledby={reviewHeadingId}
                className="flex min-h-0 flex-1 flex-col"
            >
                <h2 id={reviewHeadingId} className="shrink-0 font-semibold">
                    {t(
                        finished
                            ? 'selection.confirm.problems'
                            : 'selection.confirm.affected',
                    )}
                </h2>
                <ul
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrolling review list needs keyboard access.
                    tabIndex={0}
                    aria-labelledby={reviewHeadingId}
                    className="visible-scrollbar mt-2 min-h-0 flex-1 overscroll-contain divide-y divide-base-content/20 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                >
                    {selections
                        .filter(
                            ({ release }) =>
                                !finished ||
                                problems.some(
                                    (outcome) =>
                                        getReleaseActionKey(outcome.release) ===
                                        getReleaseActionKey(release),
                                ),
                        )
                        .map(({ release }) => {
                            const key = getReleaseActionKey(release);
                            const outcome = outcomeByKey.get(key);
                            const alias = commandLineAliases.find(
                                (candidate) =>
                                    getReleaseActionKey(candidate) === key,
                            );
                            const isDefault = commandLineDefaultKey === key;
                            const custom =
                                release.source === 'custom' ||
                                release.managed_by_launcher === false;
                            const affectedProjects = projects.filter(
                                (project) =>
                                    getEditorProjectUsageCount(release, [
                                        project,
                                    ]) > 0,
                            );
                            return (
                                <li
                                    key={key}
                                    className="py-3 first:pt-3 last:pb-0 break-words"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="font-semibold">
                                            {release.name ?? release.version}
                                            {release.name &&
                                            release.name !== release.version
                                                ? ` - ${release.version}`
                                                : ''}
                                            {' - '}
                                            {custom
                                                ? t('badges.custom')
                                                : release.mono
                                                  ? '.NET'
                                                  : t('selection.standard')}
                                            {custom && release.mono
                                                ? ' (.NET)'
                                                : ''}
                                        </h3>
                                        {outcome && (
                                            <span>
                                                {t(
                                                    `selection.results.${outcome.status}`,
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    {!outcome && (
                                        <div className="mt-1 flex flex-col gap-1">
                                            {custom && (
                                                <p>
                                                    {t(
                                                        'selection.confirm.filesKept',
                                                    )}
                                                </p>
                                            )}
                                            {(isDefault || alias) && (
                                                <p>
                                                    {t(
                                                        'selection.confirm.commands',
                                                    )}{' '}
                                                    {isDefault && (
                                                        <>
                                                            <code className="rounded bg-base-300 px-1 font-mono">
                                                                godot
                                                            </code>{' '}
                                                            (
                                                            {t(
                                                                'selection.confirm.defaultLabel',
                                                            )}
                                                            ){alias ? ', ' : ''}
                                                        </>
                                                    )}
                                                    {alias && (
                                                        <code className="rounded bg-base-300 px-1 font-mono break-all">
                                                            {alias.name}
                                                        </code>
                                                    )}
                                                </p>
                                            )}
                                            {affectedProjects.length > 0 && (
                                                <p>
                                                    {t(
                                                        'selection.confirm.projectNames',
                                                    )}{' '}
                                                    {affectedProjects
                                                        .map(
                                                            (project) =>
                                                                project.name,
                                                        )
                                                        .join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {outcome?.error && (
                                        <p className="mt-1 break-words text-error">
                                            {outcome.error}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                </ul>
            </section>
            {pending && (
                <p
                    role="status"
                    className="flex shrink-0 items-center gap-2 text-base-content/75"
                >
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                    {t('selection.removing')}
                </p>
            )}
            {error && (
                <p role="alert" className="shrink-0 text-error">
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
                    {pending && (
                        <span
                            className="loading loading-spinner loading-sm"
                            aria-hidden="true"
                        />
                    )}
                    {pending
                        ? t('selection.removing')
                        : t(
                              finished
                                  ? 'selection.retryFailed'
                                  : 'selection.remove',
                              { count: removable.length },
                          )}
                </button>
            )}
        </>,
        {
            initialFocusRef: cancelRef,
            bodyClassName: 'flex min-h-0 flex-col overflow-hidden',
            panelClassName: 'max-w-lg h-[560px] max-h-[calc(100dvh-32px)]!',
            onRequestClose: () => {
                if (!pendingRef.current) close();
            },
        },
    );
}
