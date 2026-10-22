import type {
    ClearProjectNewStatusResult,
    ProjectDetails,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    NotificationAction,
    NotificationOptions,
} from '../../../components/notifications/notification.types';
import { useNotifications } from '../../../hooks/notifications.hook';
import {
    canClearProjectNew,
    type ProjectBatchFailure,
    runProjectBatch,
} from '../project-selection.model';

type UndoEntry = { project: ProjectDetails; token: string };
type BatchState = {
    undo: UndoEntry[];
    clearFailures: ProjectBatchFailure[];
    undoFailures: ProjectBatchFailure[];
    restored: number;
    undoAttempted: boolean;
};
type BatchOptions = {
    projects: ProjectDetails[];
    clearProjectNewStatus: (
        project: ProjectDetails,
    ) => Promise<ClearProjectNewStatusResult>;
    undoClearProjectNewStatus: (token: string) => Promise<ProjectDetails>;
};
type NotificationOwner = { revision: number } | { id: number };

/** Aggregates clear/Undo feedback while preserving main-owned state and retry intent.
 * @param options - Current projects and existing single-project bridge operations.
 */
export function useProjectBatchNewStatus({
    projects,
    clearProjectNewStatus,
    undoClearProjectNewStatus,
}: BatchOptions) {
    const { t } = useTranslation(['projects', 'common']);
    const notifications = useNotifications();
    const current = useRef(projects);
    current.current = projects;
    const pending = useRef(false);
    const mounted = useRef(false);
    const ownedId = useRef<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [renderVersion, setRenderVersion] = useState(0);
    const waiters = useRef(new Map<number, () => void>());
    const nextRender = useRef(0);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            for (const resolve of waiters.current.values()) resolve();
            waiters.current.clear();
            if (ownedId.current !== null)
                notifications.dismissNotification(ownedId.current);
        };
    }, [notifications.dismissNotification]);
    useEffect(() => {
        for (const [request, resolve] of waiters.current) {
            if (request > renderVersion) continue;
            waiters.current.delete(request);
            resolve();
        }
    }, [renderVersion]);

    /** Waits for queued authoritative project events to commit before giving feedback. */
    const afterRender = () =>
        new Promise<void>((resolve) => {
            if (!mounted.current) {
                resolve();
                return;
            }
            const request = ++nextRender.current;
            waiters.current.set(request, resolve);
            setRenderVersion(request);
        });

    /** Re-enables controls and repairs lost focus without interrupting newer input. */
    const finish = () => {
        pending.current = false;
        if (!mounted.current) return;
        setBusy(false);
        requestAnimationFrame(() => {
            if (
                !mounted.current ||
                pending.current ||
                document.activeElement !== document.body ||
                document.querySelector(
                    'dialog[open], [role="dialog"][aria-modal="true"]:not(dialog)',
                )
            )
                return;
            document
                .querySelector<HTMLButtonElement>(
                    '[data-project-selection-toolbar] button[aria-haspopup]',
                )
                ?.focus({ preventScroll: true });
        });
    };

    /** Returns the same registered incarnation, rejecting stale retry targets.
     * @param project - Project captured when the original operation started.
     */
    const resolveProject = (project: ProjectDetails) => {
        const latest = current.current.find(
            (item) => item.path === project.path,
        );
        if (
            !latest ||
            latest.added_at?.getTime() !== project.added_at?.getTime()
        )
            throw new Error(t('newStatus.unavailable'));
        return latest;
    };

    /** Shows one aggregate result, without replacing a newer action's notification.
     * @param state - Successful Undo tokens and unresolved failures.
     * @param owner - Initial revision or notification being acted upon.
     */
    const showResult = (state: BatchState, owner: NotificationOwner) => {
        if (!mounted.current) return;
        let id: number | null = null;
        const actions: NotificationAction[] = [];
        if (state.undo.length)
            actions.push({
                label: t(
                    state.undoAttempted
                        ? 'selection.retryUndo'
                        : 'common:notifications.undo',
                ),
                dismissOnClick: false,
                onClick: async () => {
                    if (id !== null) await undo(state, { id });
                },
            });
        if (state.clearFailures.length)
            actions.push({
                label: t('selection.retryClear'),
                dismissOnClick: false,
                onClick: async () => {
                    if (id !== null)
                        await clear(
                            state.clearFailures.map(
                                (failure) => failure.project,
                            ),
                            state,
                            { id },
                        );
                },
            });
        const failures = [...state.clearFailures, ...state.undoFailures];
        const description = [
            t('selection.cleared', { count: state.undo.length }),
            ...(state.restored
                ? [t('selection.restored', { count: state.restored })]
                : []),
            ...(failures.length
                ? [
                      t('selection.failed', {
                          names: failures
                              .map(
                                  ({ project, error }) =>
                                      `${project.name}: ${error}`,
                              )
                              .join('; '),
                      }),
                  ]
                : []),
        ].join(' ');
        const options: NotificationOptions = {
            title: t('selection.resultTitle'),
            description,
            tone: failures.length ? 'warning' : 'success',
            durationMs: failures.length ? 20000 : 8000,
            actions,
            returnFocusElement: document.querySelector<HTMLButtonElement>(
                '[data-project-selection-toolbar] button[aria-haspopup]',
            ),
        };
        id =
            'id' in owner
                ? notifications.replaceNotification(owner.id, options)
                : notifications.showNotificationIfUnchanged(
                      owner.revision,
                      options,
                  );
        if (id !== null) ownedId.current = id;
    };

    /** Clears only reviewed targets, keeping prior successes and original retry intent.
     * @param targets - Initially eligible projects or the failed subset.
     * @param previous - Earlier results that must survive a retry.
     * @param owner - Revision or notification owning this attempt.
     */
    const clear = async (
        targets: ProjectDetails[],
        previous: BatchState,
        owner: NotificationOwner,
    ) => {
        if (pending.current || !mounted.current || !targets.length) return;
        pending.current = true;
        setBusy(true);
        try {
            const result = await runProjectBatch(targets, async (project) => {
                const latest = resolveProject(project);
                if (!canClearProjectNew(latest))
                    throw new Error(t('newStatus.unavailable'));
                return clearProjectNewStatus(latest);
            });
            await afterRender();
            showResult(
                {
                    ...previous,
                    undo: [
                        ...previous.undo,
                        ...result.successes.map(({ value }) => ({
                            project: value.project,
                            token: value.undoToken,
                        })),
                    ],
                    clearFailures: result.failures,
                },
                owner,
            );
        } finally {
            finish();
        }
    };

    /** Restores successful clears once each, retaining only unresolved Undo tokens.
     * @param previous - Current batch result and main-owned Undo tokens.
     * @param owner - Notification owning this Undo attempt.
     */
    const undo = async (previous: BatchState, owner: NotificationOwner) => {
        if (pending.current || !mounted.current) return;
        pending.current = true;
        setBusy(true);
        try {
            const tokens = new Map(
                previous.undo.map((entry) => [entry.project.path, entry.token]),
            );
            const result = await runProjectBatch(
                previous.undo.map((entry) => entry.project),
                async (project) => {
                    resolveProject(project);
                    const token = tokens.get(project.path);
                    if (!token) throw new Error(t('newStatus.unavailable'));
                    return undoClearProjectNewStatus(token);
                },
            );
            const failedPaths = new Set(
                result.failures.map(({ project }) => project.path),
            );
            await afterRender();
            showResult(
                {
                    ...previous,
                    undo: previous.undo.filter((entry) =>
                        failedPaths.has(entry.project.path),
                    ),
                    undoFailures: result.failures,
                    restored: previous.restored + result.successes.length,
                    undoAttempted: true,
                },
                owner,
            );
        } finally {
            finish();
        }
    };

    return {
        busy,
        clearNew: (targets: ProjectDetails[]) =>
            clear(
                targets.filter(canClearProjectNew),
                {
                    undo: [],
                    clearFailures: [],
                    undoFailures: [],
                    restored: 0,
                    undoAttempted: false,
                },
                { revision: notifications.getNotificationRevision() },
            ),
    };
}
