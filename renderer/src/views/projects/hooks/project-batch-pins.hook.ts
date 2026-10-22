import type { ProjectDetails } from '@shared/contracts';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationOptions } from '../../../components/notifications/notification.types';
import { useNotifications } from '../../../hooks/notifications.hook';
import { projectsBridge } from '../../../renderer.bridge';
import {
    beginProjectBatch,
    finishProjectBatch,
    isProjectBatchPending,
    subscribeProjectBatch,
} from '../project-batch-activity.store';
import {
    getEligibleProjectPins,
    type ProjectPinBatch,
    runProjectPinBatch,
} from '../project-bulk-pins.model';

type PinOptions = {
    isBlocked: () => boolean;
    setProjectPinned: (
        project: ProjectDetails,
        pinned: boolean,
    ) => Promise<ProjectDetails[]>;
    reorderPinnedProjects: (paths: string[]) => Promise<ProjectDetails[]>;
};
type NotificationOwner = { id: number } | { revision: number };

/** Saves explicit bulk pin intent with failed-only and ordering-only recovery.
 * @param options - Existing project persistence APIs and other batches' pending guard.
 */
export function useProjectBatchPins(options: PinOptions) {
    const { t } = useTranslation(['projects', 'common']);
    const notifications = useNotifications();
    const current = useRef(options);
    current.current = options;
    const mounted = useRef(false);
    const owned = useRef<number | null>(null);
    const busy = useSyncExternalStore(
        subscribeProjectBatch,
        isProjectBatchPending,
        isProjectBatchPending,
    );
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (owned.current !== null)
                notifications.dismissNotification(owned.current);
        };
    }, [notifications.dismissNotification]);

    /** Saves only the reviewed targets while keeping original ordering and successes.
     * @param state - Original pin/unpin direction, targets and earlier outcomes.
     * @param targets - Initial eligible targets or failures; empty for order-only retry.
     * @param owner - Revision or notification owning this attempt.
     */
    const execute = async (
        state: ProjectPinBatch,
        targets: ProjectDetails[],
        owner: NotificationOwner,
    ): Promise<void> => {
        if (current.current.isBlocked() || !mounted.current) return;
        const ownerToken = beginProjectBatch();
        if (ownerToken === null) return;
        try {
            const next = await runProjectPinBatch({
                state,
                targets,
                readProjects: () => projectsBridge.getProjectsDetails(),
                setProjectPinned: current.current.setProjectPinned,
                reorderPinnedProjects: current.current.reorderPinnedProjects,
                unavailable: t('selection.pinProjectUnavailable'),
            });
            if (!mounted.current) return;
            let id: number | null = null;
            const description = [
                t(next.pinned ? 'selection.pinned' : 'selection.unpinned', {
                    count: next.completed.length,
                }),
                ...(next.failures.length
                    ? [
                          t('selection.failed', {
                              names: next.failures
                                  .map(
                                      ({ project, error }) =>
                                          `${project.name}: ${error}`,
                                  )
                                  .join('; '),
                          }),
                      ]
                    : []),
                ...(next.orderError
                    ? [
                          t('selection.pinOrderFailed', {
                              error: next.orderError,
                          }),
                      ]
                    : []),
            ].join(' ');
            const notification: NotificationOptions = {
                title: t('selection.resultTitle'),
                description,
                tone:
                    next.failures.length || next.orderError
                        ? 'warning'
                        : 'success',
                durationMs:
                    next.failures.length || next.orderError ? 20000 : 5000,
                actions:
                    next.failures.length || next.orderError
                        ? [
                              {
                                  label: t('common:buttons.retry'),
                                  dismissOnClick: false,
                                  onClick: async () => {
                                      if (id !== null)
                                          await execute(
                                              next,
                                              next.failures.map(
                                                  (failure) => failure.project,
                                              ),
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
                'id' in owner
                    ? notifications.replaceNotification(owner.id, notification)
                    : notifications.showNotificationIfUnchanged(
                          owner.revision,
                          notification,
                      );
            if (id !== null) owned.current = id;
        } finally {
            finishProjectBatch(ownerToken);
            if (mounted.current) {
                requestAnimationFrame(() => {
                    if (
                        !mounted.current ||
                        isProjectBatchPending() ||
                        document.activeElement !== document.body ||
                        document.querySelector(
                            'dialog[open], [role="dialog"][aria-modal="true"]:not(dialog), :popover-open',
                        )
                    )
                        return;
                    document
                        .querySelector<HTMLButtonElement>(
                            '[data-project-selection-toolbar] button[aria-haspopup]',
                        )
                        ?.focus({ preventScroll: true });
                });
            }
        }
    };
    /** Captures the eligible subset once, preserving its displayed order through retries.
     * @param projects - Reviewed selected projects in current display order.
     * @param pinned - Explicit desired pin state, never an inversion.
     */
    const change = (projects: ProjectDetails[], pinned: boolean) => {
        const targets = getEligibleProjectPins(projects, pinned);
        if (!targets.length) return;
        return execute(
            {
                pinned,
                orderedTargets: targets,
                completed: [],
                changed: [],
                failures: [],
                orderError: null,
            },
            targets,
            { revision: notifications.getNotificationRevision() },
        );
    };
    return { busy, change };
}
