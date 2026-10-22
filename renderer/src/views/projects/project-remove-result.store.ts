import type { ProjectDetails } from '@shared/contracts';
import type { ProjectBatchFailure } from './project-selection.model';

export type ProjectRemovalOutcome = {
    completed: ProjectDetails[];
    failures: ProjectBatchFailure[];
    owner: { id: number } | { revision: number };
    restoreSelection: boolean;
};

let result: ProjectRemovalOutcome | null = null;
const listeners = new Set<() => void>();

/** Retains completed removal feedback until a Projects view can present it.
 * @param outcome - Original notification ownership and independent saved outcomes.
 */
export function publishProjectRemovalOutcome(
    outcome: ProjectRemovalOutcome,
): void {
    result = outcome;
    for (const listener of listeners) listener();
}

/** Claims feedback once, including after a route remount. */
export function takeProjectRemovalOutcome(): ProjectRemovalOutcome | null {
    const outcome = result;
    result = null;
    return outcome;
}

/** Subscribes the currently mounted Projects view to completed removal feedback.
 * @param listener - Consumer notified when an outcome is available.
 */
export function subscribeProjectRemovalOutcome(
    listener: () => void,
): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
