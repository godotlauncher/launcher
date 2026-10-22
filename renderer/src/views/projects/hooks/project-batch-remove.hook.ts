import type { ProjectDetails } from '@shared/contracts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../../hooks/notifications.hook';
import { projectsBridge } from '../../../renderer.bridge';
import {
    beginProjectBatch,
    finishProjectBatch,
    isProjectBatchPending,
    subscribeProjectBatch,
} from '../project-batch-activity.store';
import { runProjectRemoval } from '../project-bulk-remove.model';
import {
    type ProjectRemovalOutcome,
    publishProjectRemovalOutcome,
    subscribeProjectRemovalOutcome,
    takeProjectRemovalOutcome,
} from '../project-remove-result.store';
import { getUniqueProjects } from '../project-selection.model';

type NotificationOwner = { id: number } | { revision: number };
type RemovalSession = {
    targets: ProjectDetails[];
    completed: ProjectDetails[];
    owner: NotificationOwner;
};

/** Captures confirmed removals and offers reviewed, failed-only recovery.
 * @param isBlocked - Checks other project workflows before opening or saving.
 * @param onRecoveredFailures - Restores eligible failed selection after a route remount.
 */
export function useProjectBatchRemove(
    isBlocked: () => boolean,
    onRecoveredFailures: (targets: ProjectDetails[]) => void,
) {
    const { t } = useTranslation(['projects', 'common']);
    const notifications = useNotifications();
    const blocked = useRef(isBlocked);
    blocked.current = isBlocked;
    const mounted = useRef(false);
    const ownedId = useRef<number | null>(null);
    const lastOutcome = useRef<ProjectRemovalOutcome | null>(null);
    const recover = useRef(onRecoveredFailures);
    recover.current = onRecoveredFailures;
    const present = useRef<(outcome: ProjectRemovalOutcome) => void>(() => {});
    const sessionRef = useRef<RemovalSession | null>(null);
    const pending = useRef(false);
    const [session, setSession] = useState<RemovalSession | null>(null);
    const busy = useSyncExternalStore(
        subscribeProjectBatch,
        isProjectBatchPending,
        isProjectBatchPending,
    );
    useEffect(() => {
        mounted.current = true;
        const consume = () => {
            const outcome = takeProjectRemovalOutcome();
            if (outcome) present.current(outcome);
        };
        const unsubscribe = subscribeProjectRemovalOutcome(consume);
        consume();
        return () => {
            mounted.current = false;
            unsubscribe();
            const id = ownedId.current;
            if (id !== null) {
                const wasCurrent = notifications.isNotificationCurrent(id);
                notifications.dismissNotification(id);
                const reviewed = sessionRef.current;
                if (
                    reviewed &&
                    'id' in reviewed.owner &&
                    reviewed.owner.id === id
                )
                    reviewed.owner = { revision: id };
                if (
                    wasCurrent &&
                    !pending.current &&
                    lastOutcome.current?.failures.length
                )
                    publishProjectRemovalOutcome({
                        ...lastOutcome.current,
                        owner: { revision: id },
                        restoreSelection: true,
                    });
            }
        };
    }, [
        notifications.dismissNotification,
        notifications.isNotificationCurrent,
    ]);

    /** Restores Actions focus after the modal closes if no newer input owns it. */
    const restoreFocus = () => {
        requestAnimationFrame(() => {
            if (
                !mounted.current ||
                isProjectBatchPending() ||
                document.activeElement !== document.body ||
                document.querySelector('dialog[open], :popover-open')
            )
                return;
            document
                .querySelector<HTMLButtonElement>(
                    '[data-project-selection-toolbar] button[aria-haspopup]',
                )
                ?.focus({ preventScroll: true });
        });
    };

    /** Opens one confirmation for the original targets or only the failed subset.
     * @param targets - Reviewed registrations to remove.
     * @param completed - Earlier successful removals that must not be repeated.
     * @param owner - Notification revision or previous result owning this attempt.
     */
    const request = (
        targets: ProjectDetails[],
        completed: ProjectDetails[] = [],
        owner: NotificationOwner = {
            revision: notifications.getNotificationRevision(),
        },
    ) => {
        if (
            !mounted.current ||
            blocked.current() ||
            isProjectBatchPending() ||
            sessionRef.current
        )
            return;
        const unique = getUniqueProjects(targets);
        if (!unique.length) return;
        const next = { targets: unique, completed, owner };
        sessionRef.current = next;
        setSession(next);
    };

    /** Cancels only before saving; pending Escape and repeated clicks are ignored. */
    const cancel = () => {
        if (pending.current) return;
        sessionRef.current = null;
        setSession(null);
        restoreFocus();
    };

    /** Presents one completed result with recovery bound to the currently mounted view.
     * @param outcome - Original targets, saved successes, failures and notification owner.
     */
    const showResult = (outcome: ProjectRemovalOutcome) => {
        const completed = outcome.completed;
        let id: number | null = null;
        const notification = {
            title: t('selection.resultTitle'),
            description: [
                t('selection.removed', { count: completed.length }),
                ...(outcome.failures.length
                    ? [
                          t('selection.failed', {
                              names: outcome.failures
                                  .map(
                                      ({ project, error }) =>
                                          `${project.name}: ${error}`,
                                  )
                                  .join('; '),
                          }),
                      ]
                    : []),
            ].join(' '),
            tone: outcome.failures.length
                ? ('warning' as const)
                : ('success' as const),
            durationMs: outcome.failures.length ? 20000 : 5000,
            actions: outcome.failures.length
                ? [
                      {
                          label: t('common:buttons.retry'),
                          dismissOnClick: false,
                          onClick: () => {
                              if (id !== null)
                                  request(
                                      outcome.failures.map(
                                          ({ project }) => project,
                                      ),
                                      completed,
                                      { id },
                                  );
                          },
                      },
                  ]
                : [],
            returnFocusElement: document.querySelector<HTMLButtonElement>(
                '[data-project-selection-toolbar] button[aria-haspopup]',
            ),
        };
        id =
            'id' in outcome.owner
                ? notifications.replaceNotification(
                      outcome.owner.id,
                      notification,
                  )
                : notifications.showNotificationIfUnchanged(
                      outcome.owner.revision,
                      notification,
                  );
        ownedId.current = id;
        lastOutcome.current = id !== null ? outcome : null;
        if (outcome.restoreSelection)
            recover.current(outcome.failures.map(({ project }) => project));
    };
    present.current = showResult;

    /** Saves the captured set once and reports every independent outcome. */
    const confirm = async () => {
        const reviewed = sessionRef.current;
        if (
            !reviewed ||
            pending.current ||
            blocked.current() ||
            !mounted.current
        )
            return;
        const token = beginProjectBatch();
        if (!token) return;
        pending.current = true;
        let outcome: ProjectRemovalOutcome | undefined;
        try {
            const result = await runProjectRemoval({
                targets: reviewed.targets,
                readProjects: () => projectsBridge.getProjectsDetails(),
                removeProject: (project) =>
                    projectsBridge.removeProject(project),
                unavailable: t('selection.removeProjectUnavailable'),
            });
            outcome = {
                completed: getUniqueProjects([
                    ...reviewed.completed,
                    ...result.successes.map(({ project }) => project),
                ]),
                failures: result.failures,
                owner: reviewed.owner,
                restoreSelection: !mounted.current,
            };
            if (mounted.current) {
                sessionRef.current = null;
                setSession(null);
            }
        } finally {
            pending.current = false;
            finishProjectBatch(token);
            if (outcome) publishProjectRemovalOutcome(outcome);
            if (mounted.current) restoreFocus();
        }
    };
    return { busy, session, request, cancel, confirm };
}
