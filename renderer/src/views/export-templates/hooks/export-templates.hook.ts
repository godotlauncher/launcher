import type { ExportTemplateInventory, TemplateJob } from '@shared/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { exportTemplatesBridge } from '../../../renderer.bridge';
import { refreshTemplateJobs, useTemplateJobs } from './template-jobs.hook';

export type TemplateAction =
    | { type: 'retry'; jobId: string }
    | { type: 'savePackage'; token: string; selected: string[] }
    | { type: 'remove'; setId: string }
    | { type: 'recover'; recoveryId: string }
    | { type: 'cancel'; jobId: string }
    | { type: 'openFolder' };

/** Checks whether another template operation can start.
 * @param job - Last known template job.
 */
export const isTemplateJobFinished = (job: TemplateJob | null) =>
    !job || ['complete', 'cancelled', 'error'].includes(job.stage);

/** Dispatches an explicit user action through the preload bridge.
 * @param action - Requested operation and its inputs.
 */
function perform(action: TemplateAction): Promise<void> {
    switch (action.type) {
        case 'retry':
            return exportTemplatesBridge.retryJob(action.jobId);
        case 'savePackage':
            return exportTemplatesBridge.savePackage(
                action.token,
                action.selected,
            );
        case 'remove':
            return exportTemplatesBridge.remove(action.setId);
        case 'recover':
            return exportTemplatesBridge.recover(action.recoveryId);
        case 'cancel':
            return exportTemplatesBridge.cancel(action.jobId);
        case 'openFolder':
            return exportTemplatesBridge.openFolder();
    }
}

/** Owns inventory refreshes, ordered job polling and user actions. */
export function useExportTemplates() {
    const [inventory, setInventory] = useState<Omit<
        ExportTemplateInventory,
        'job'
    > | null>(null);
    const queuedJobs = useTemplateJobs();
    const [removingSet, setRemovingSet] = useState<string | null>(null);
    const jobs: TemplateJob[] =
        removingSet &&
        !queuedJobs.some(
            (item) =>
                item.kind === 'remove' &&
                item.setIds?.includes(removingSet) &&
                !isTemplateJobFinished(item),
        )
            ? [
                  ...queuedJobs,
                  {
                      id: `pending-remove-${removingSet}`,
                      kind: 'remove',
                      setIds: [removingSet],
                      stage: 'applying',
                  },
              ]
            : queuedJobs;
    const [readError, setReadError] = useState('');
    const [jobReadError, setJobReadError] = useState('');
    const [actionError, setActionError] = useState('');
    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(true);
    const inventoryRequest = useRef(0);

    /** Rescans inventory without publishing its potentially older job snapshot. */
    const refreshInventory = useCallback(async () => {
        const request = ++inventoryRequest.current;
        try {
            const { job: _job, ...result } =
                await exportTemplatesBridge.getInventory();
            if (request === inventoryRequest.current) {
                setInventory(result);
                setReadError('');
            }
        } catch {
            if (request === inventoryRequest.current)
                setReadError('exportTemplates:errors.read');
        } finally {
            if (request === inventoryRequest.current) setLoading(false);
        }
    }, []);

    /** Refreshes both disk inventory and live progress on entry, focus or request. */
    const refresh = useCallback(async () => {
        await Promise.all([
            refreshTemplateJobs().then(
                () => setJobReadError(''),
                () => setJobReadError('exportTemplates:errors.read'),
            ),
            refreshInventory(),
        ]);
    }, [refreshInventory]);
    useEffect(() => {
        const focus = () => {
            void refresh();
        };
        focus();
        window.addEventListener('focus', focus);
        return () => {
            window.removeEventListener('focus', focus);
            inventoryRequest.current++;
        };
    }, [refresh]);

    const active = jobs.some((item) => !isTemplateJobFinished(item));
    const lifecycle = jobs.map((item) => `${item.id}:${item.stage}`).join('|');
    // biome-ignore lint/correctness/useExhaustiveDependencies: Rescan only lifecycle transitions, not each progress byte.
    useEffect(() => {
        void refreshInventory();
    }, [lifecycle, refreshInventory]);

    /** Runs an explicit template action.
     * @param action - User-requested operation.
     */
    const run = async (action: TemplateAction) => {
        setPending(true);
        setActionError('');
        if (action.type === 'remove') setRemovingSet(action.setId);
        try {
            try {
                await perform(action);
            } catch (failure) {
                if (action.type !== 'recover') setActionError(String(failure));
                void refreshTemplateJobs().catch(() => undefined);
                return false;
            }
            await refresh();
            return true;
        } finally {
            if (action.type === 'remove') setRemovingSet(null);
            setPending(false);
        }
    };
    return {
        inventory,
        jobs,
        error: actionError || readError || jobReadError,
        pending,
        loading,
        busy: pending || active,
        refresh,
        run,
    };
}
