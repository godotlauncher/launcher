import type { ProjectDetails } from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../../hooks/notifications.hook';
import { useProjectTags } from '../../../hooks/project-tags.hook';
import { projectTagsBridge } from '../../../renderer.bridge';
import {
    type ProjectTagIntent,
    runProjectTagBatch,
} from '../project-bulk-tags.model';

type NotificationOwner = { id: number } | { revision: number };

/** Runs immediate bulk tag edits and retains failed-only original-intent recovery.
 * @param projects - Current registrations for stale-target validation.
 * @param isBlocked - Checks whether another project batch owns mutation controls.
 */
export function useProjectBatchTags(
    projects: ProjectDetails[],
    isBlocked: () => boolean,
) {
    const { t } = useTranslation('projects');
    const { save, reload } = useProjectTags();
    const notifications = useNotifications();
    const current = useRef({ projects, isBlocked });
    current.current = { projects, isBlocked };
    const mounted = useRef(false);
    const pending = useRef(false);
    const owned = useRef<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<{
        description: string;
        retry: () => Promise<boolean>;
    } | null>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (owned.current !== null)
                notifications.dismissNotification(owned.current);
        };
    }, [notifications.dismissNotification]);

    /** Saves the reviewed intent, retaining successes and targeting only retry failures.
     * @param targets - Original targets or failed subset from an earlier attempt.
     * @param intent - Add/remove direction captured before any save.
     * @param owner - Notification revision or result being retried.
     */
    const change = async (
        targets: ProjectDetails[],
        intent: ProjectTagIntent,
        owner: NotificationOwner = {
            revision: notifications.getNotificationRevision(),
        },
    ): Promise<boolean> => {
        if (
            pending.current ||
            current.current.isBlocked() ||
            !mounted.current ||
            !targets.length
        )
            return false;
        pending.current = true;
        setBusy(true);
        setFailure(null);
        try {
            const next = await runProjectTagBatch({
                targets,
                intent,
                getProjects: () => current.current.projects,
                getSnapshot: () => projectTagsBridge.getSnapshot(),
                save,
                unavailable: t('selection.tagProjectUnavailable'),
                unknownTag: t('selection.tagUnavailable'),
            });
            await reload();
            if (!mounted.current) return false;
            let id: number | null = null;
            /** Repeats only unresolved targets with the original tag intent. */
            const retry = () =>
                change(
                    next.failures.map(({ project }) => project),
                    next.intent,
                    id !== null
                        ? { id }
                        : { revision: notifications.getNotificationRevision() },
                );
            const options = {
                title: t('tags.label'),
                description: next.failures.length
                    ? t('selection.failed', {
                          names: next.failures
                              .map(({ project, error }) => {
                                  const message =
                                      error === 'invalid-project'
                                          ? t('selection.tagProjectUnavailable')
                                          : error === 'unknown-tag'
                                            ? t('selection.tagUnavailable')
                                            : error;
                                  return `${project.name}: ${message}`;
                              })
                              .join('; '),
                      })
                    : t('selection.tagsSaved', {
                          count: next.successes.length,
                      }),
                tone: next.failures.length
                    ? ('warning' as const)
                    : ('success' as const),
                durationMs: next.failures.length ? 20000 : 5000,
                actions: next.failures.length
                    ? [
                          {
                              label: t('tags.retry'),
                              dismissOnClick: false,
                              onClick: async () => {
                                  await retry();
                              },
                          },
                      ]
                    : [],
            };
            id =
                'id' in owner
                    ? notifications.replaceNotification(owner.id, options)
                    : notifications.showNotificationIfUnchanged(
                          owner.revision,
                          options,
                      );
            if (id !== null) owned.current = id;
            setFailure(
                next.failures.length
                    ? { description: options.description, retry }
                    : null,
            );
            return next.failures.length === 0;
        } finally {
            pending.current = false;
            if (mounted.current) {
                setBusy(false);
                requestAnimationFrame(() => {
                    if (
                        !mounted.current ||
                        pending.current ||
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
    return { busy, change, failure, clearFailure: () => setFailure(null) };
}
