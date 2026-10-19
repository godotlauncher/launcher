import type {
    ClearProjectNewStatusResult,
    ProjectDetails,
} from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationOptions } from '../../../components/notifications/notification.types';
import { useNotifications } from '../../../hooks/notifications.hook';

type ProjectNewStatusOptions = {
    projects: ProjectDetails[];
    clearProjectNewStatus: (
        project: ProjectDetails,
    ) => Promise<ClearProjectNewStatusResult>;
    undoClearProjectNewStatus: (undoToken: string) => Promise<ProjectDetails>;
};

/** Finds the current action trigger after a project moves between groups.
 * @param projectPath - Exact registered project path.
 */
function getProjectActionTrigger(
    projectPath: string,
): HTMLButtonElement | null {
    return (
        [
            ...document.querySelectorAll<HTMLButtonElement>(
                'button[data-project-actions]',
            ),
        ].find((button) => button.dataset.projectActions === projectPath) ??
        null
    );
}

/** Restores a moved project's focus without interrupting another control or dialog.
 * @param projectPath - Project whose removed control previously held focus.
 */
function restoreProjectFocus(projectPath: string): void {
    if (
        document.querySelector(
            'dialog[open], [role="dialog"][aria-modal="true"]:not(dialog)',
        )
    )
        return;
    const active = document.activeElement;
    if (
        active === document.body ||
        (active instanceof HTMLElement &&
            active.dataset.projectActions === projectPath)
    )
        getProjectActionTrigger(projectPath)?.focus({ preventScroll: true });
}

/** Owns project-specific Clear New feedback while reusing the shared notification UI.
 * @param options - Live projects and their persisted clear/Undo operations.
 */
export function useProjectNewStatus({
    projects,
    clearProjectNewStatus,
    undoClearProjectNewStatus,
}: ProjectNewStatusOptions) {
    const { t } = useTranslation(['projects', 'common']);
    const {
        getNotificationRevision,
        showNotificationIfUnchanged,
        replaceNotification,
        dismissNotification,
    } = useNotifications();
    const currentProjects = useRef(projects);
    currentProjects.current = projects;
    const pending = useRef(new Set<string>());
    const mounted = useRef(false);
    const [renderRequest, setRenderRequest] = useState(0);
    const nextRenderRequest = useRef(0);
    const renderWaiters = useRef(new Map<number, () => void>());
    const owned = useRef<{
        id: number;
        path: string;
        addedAt: number | undefined;
        canUndo: boolean;
    } | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            for (const resolve of renderWaiters.current.values()) resolve();
            renderWaiters.current.clear();
            if (owned.current) dismissNotification(owned.current.id);
        };
    }, [dismissNotification]);

    useEffect(() => {
        for (const [request, resolve] of renderWaiters.current) {
            if (request > renderRequest) continue;
            renderWaiters.current.delete(request);
            resolve();
        }
    }, [renderRequest]);

    /** Waits for a React commit that includes already queued project updates. */
    const afterProjectRender = (): Promise<void> => {
        if (!mounted.current) return Promise.resolve();
        const request = ++nextRenderRequest.current;
        return new Promise((resolve) => {
            renderWaiters.current.set(request, resolve);
            setRenderRequest(request);
        });
    };

    useEffect(() => {
        const notification = owned.current;
        if (!notification?.canUndo) return;
        const project = projects.find(
            (candidate) => candidate.path === notification.path,
        );
        if (
            !project ||
            project.last_opened ||
            project.added_at?.getTime() !== notification.addedAt
        ) {
            dismissNotification(notification.id);
            owned.current = null;
        }
    }, [projects, dismissNotification]);

    /** Shows a saved result without overwriting feedback from a newer action.
     * @param project - Canonical project after the saved operation.
     * @param owner - Notification identity or revision captured before the operation.
     * @param undoToken - Optional main-owned identity for restoring New.
     */
    const showSavedStatus = (
        project: ProjectDetails,
        owner: { id: number } | { revision: number },
        undoToken?: string,
    ) => {
        let notificationId: number | null = null;
        const options: NotificationOptions = {
            title: t(undoToken ? 'newStatus.cleared' : 'newStatus.restored'),
            description: t(
                undoToken
                    ? project.pinned
                        ? 'newStatus.clearedPinned'
                        : 'newStatus.clearedRecent'
                    : project.pinned
                      ? 'newStatus.restoredPinned'
                      : 'newStatus.restoredNew',
                { name: project.name },
            ),
            tone: 'success',
            returnFocusElement: getProjectActionTrigger(project.path),
            actions: undoToken
                ? [
                      {
                          label: t('common:notifications.undo'),
                          onClick: async () => {
                              const sourceId = notificationId;
                              const restored =
                                  await undoClearProjectNewStatus(undoToken);
                              await afterProjectRender();
                              if (!mounted.current || sourceId === null) return;
                              const current = currentProjects.current.find(
                                  (candidate) =>
                                      candidate.path === restored.path,
                              );
                              if (
                                  !current ||
                                  current.last_opened ||
                                  !current.is_new
                              )
                                  return;
                              showSavedStatus(current, { id: sourceId });
                          },
                      },
                  ]
                : [],
        };
        notificationId =
            'id' in owner
                ? replaceNotification(owner.id, options)
                : showNotificationIfUnchanged(owner.revision, options);
        if (notificationId !== null) {
            owned.current = {
                id: notificationId,
                path: project.path,
                addedAt: project.added_at?.getTime(),
                canUndo: !!undoToken,
            };
            requestAnimationFrame(() => {
                if (mounted.current) restoreProjectFocus(project.path);
            });
        }
    };

    /** Clears New once per project and shows feedback only after the saved state renders.
     * @param project - Project selected from the actions menu.
     */
    const clearNewStatus = async (project: ProjectDetails): Promise<void> => {
        if (pending.current.has(project.path)) return;
        pending.current.add(project.path);
        const revision = getNotificationRevision();
        try {
            const result = await clearProjectNewStatus(project);
            await afterProjectRender();
            if (!mounted.current) return;
            const current = currentProjects.current.find(
                (candidate) => candidate.path === result.project.path,
            );
            if (
                !current ||
                current.last_opened ||
                current.is_new ||
                current.added_at?.getTime() !==
                    result.project.added_at?.getTime()
            )
                return;
            showSavedStatus(current, { revision }, result.undoToken);
        } catch {
            if (!mounted.current) return;
            const id = showNotificationIfUnchanged(revision, {
                title: t('newStatus.clearFailed'),
                description: t('common:notifications.actionFailed'),
                tone: 'error',
                returnFocusElement: getProjectActionTrigger(project.path),
            });
            if (id === null) return;
            owned.current = {
                id,
                path: project.path,
                addedAt: project.added_at?.getTime(),
                canUndo: false,
            };
            restoreProjectFocus(project.path);
        } finally {
            pending.current.delete(project.path);
        }
    };

    return { clearNewStatus };
}
