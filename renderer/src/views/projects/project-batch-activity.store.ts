let active: symbol | null = null;
const listeners = new Set<() => void>();

/** Reports renderer-local project batch work even when the Projects route is unmounted. */
export function isProjectBatchPending(): boolean {
    return active !== null;
}

/** Subscribes a mounted view to the lifetime of the current project batch.
 * @param listener - Notifies React that the pending snapshot changed.
 */
export function subscribeProjectBatch(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Claims the single project batch, returning null if another one owns it. */
export function beginProjectBatch(): symbol | null {
    if (active !== null) return null;
    active = Symbol('project-batch');
    for (const listener of listeners) listener();
    return active;
}

/** Releases only the operation that owns the pending guard.
 * @param owner - Token captured when the batch began.
 */
export function finishProjectBatch(owner: symbol): void {
    if (active !== owner) return;
    active = null;
    for (const listener of listeners) listener();
}
