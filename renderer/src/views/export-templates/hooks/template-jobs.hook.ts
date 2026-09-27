import type { TemplateJob } from '@shared/contracts';
import { useSyncExternalStore } from 'react';
import { exportTemplatesBridge } from '../../../renderer.bridge';

let jobs: TemplateJob[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let polling = false;
let request = 0;
/** Publishes only the newest bridge snapshot, including action-triggered reads. */
async function readJobs(): Promise<void> {
    const current = ++request;
    const next = await exportTemplatesBridge.getJobs();
    if (current !== request) return;
    jobs = next;
    for (const listener of listeners) listener();
}
/** Reads queue progress once for every mounted consumer. */
async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
        await readJobs();
    } catch {
        /* Preserve the last known activity during a transient bridge failure. */
    } finally {
        polling = false;
        if (listeners.size) timer = setTimeout(() => void poll(), 500);
    }
}
/** Subscribes a view to the shared progress poll.
 * @param listener - React store listener.
 */
function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) void poll();
    return () => {
        listeners.delete(listener);
        if (!listeners.size) clearTimeout(timer);
    };
}
/** Requests fresh progress immediately after a user action. */
export async function refreshTemplateJobs(): Promise<void> {
    await readJobs();
}
/** Reads all queue entries for the template registry. */
export function useTemplateJobs(): TemplateJob[] {
    return useSyncExternalStore(subscribe, () => jobs);
}
/** Reads shared activity only; project operations report progress in project settings. */
export function useTemplateActivity(): boolean {
    return useSyncExternalStore(subscribe, () =>
        jobs.some(
            (job) =>
                !job.projectPath &&
                !['complete', 'cancelled', 'error'].includes(job.stage),
        ),
    );
}
