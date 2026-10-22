let active: symbol | null = null;
const listeners = new Set<() => void>();

/** Reports renderer-local pin work even when the Projects route is unmounted. */
export function isProjectPinBatchPending(): boolean {
    return active !== null;
}

/** Subscribes a mounted view to the lifetime of the current pin operation.
 * @param listener - Notifies React that the pending snapshot changed.
 */
export function subscribeProjectPinBatch(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Claims the single pin operation, returning null if another one owns it. */
export function beginProjectPinBatch(): symbol | null {
    if (active !== null) return null;
    active = Symbol('project-pin-batch');
    for (const listener of listeners) listener();
    return active;
}

/** Releases only the operation that owns the pending guard.
 * @param owner - Token captured when the batch began.
 */
export function finishProjectPinBatch(owner: symbol): void {
    if (active !== owner) return;
    active = null;
    for (const listener of listeners) listener();
}
