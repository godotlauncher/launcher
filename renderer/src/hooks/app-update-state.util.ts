import type { AppUpdateMessage } from '@shared/contracts';

/**
 * Keeps the active update intact when unrelated or incomplete events arrive.
 *
 * @param current - Last accepted renderer update state.
 * @param incoming - Update event received through the preload bridge.
 * @returns The next renderer update state.
 */
export function reduceAppUpdateState(
    current: AppUpdateMessage | undefined,
    incoming: AppUpdateMessage,
): AppUpdateMessage {
    const active = current?.type === 'downloading' || current?.downloaded;
    if (
        active &&
        (incoming.type === 'checking' ||
            incoming.type === 'none' ||
            incoming.type === 'available' ||
            incoming.type === 'manual' ||
            (incoming.type === 'error' && incoming.failedOperation === 'check'))
    ) {
        return current;
    }
    if (
        active &&
        current.version &&
        incoming.version &&
        incoming.version !== current.version
    ) {
        return current;
    }
    if (
        current?.downloaded &&
        incoming.type !== 'ready' &&
        !(incoming.type === 'error' && incoming.failedOperation === 'install')
    ) {
        return current;
    }

    const keepsTarget =
        incoming.type === 'downloading' ||
        incoming.type === 'ready' ||
        (incoming.type === 'error' && incoming.failedOperation !== 'check');
    const next = {
        ...incoming,
        ...(keepsTarget && !incoming.version && current?.version
            ? { version: current.version }
            : {}),
    };
    if (incoming.type === 'downloading') {
        const percent = incoming.progressPercent;
        if (percent !== undefined && Number.isFinite(percent)) {
            next.progressPercent = Math.min(100, Math.max(0, percent));
        } else if (current?.type === 'downloading') {
            next.progressPercent = current.progressPercent;
        } else {
            delete next.progressPercent;
        }
    }
    return next;
}

/**
 * Reports when checking or changing channels could disturb the selected update.
 *
 * @param update - Current renderer update state.
 * @returns Whether update settings should disable incompatible actions.
 */
export function isAppUpdateInProgress(
    update: AppUpdateMessage | undefined,
): boolean {
    return (
        update?.type === 'checking' ||
        update?.type === 'downloading' ||
        update?.downloaded === true
    );
}
