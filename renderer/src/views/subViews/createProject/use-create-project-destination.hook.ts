import type { CreateProjectDestinationInspection } from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { projectsBridge } from '../../../bridge';

/**
 * Checks the exact creation target without allowing stale results to enable creation.
 *
 * @param open - Whether the creation form is open.
 * @param projectName - Current project name.
 * @param destination - Final path including the sanitised project folder.
 * @param failureMessage - Localised fallback for transport errors.
 * @returns Current validation state and a fresh submission check.
 */
export function useCreateProjectDestination(
    open: boolean,
    projectName: string,
    destination: string,
    failureMessage: string,
) {
    const key = JSON.stringify([open, projectName, destination]);
    const latestKey = useRef(key);
    latestKey.current = key;
    const requestId = useRef(0);
    const enabled = open && Boolean(projectName.trim() && destination.trim());
    const [snapshot, setSnapshot] = useState<{
        key: string;
        result: CreateProjectDestinationInspection;
    } | null>(null);
    const [checkingNow, setCheckingNow] = useState(false);

    useEffect(() => {
        const id = ++requestId.current;
        setSnapshot(null);
        if (!enabled) return;
        const timer = window.setTimeout(async () => {
            let result: CreateProjectDestinationInspection;
            try {
                result = await projectsBridge.inspectCreateProjectDestination(
                    projectName,
                    destination,
                );
            } catch {
                result = { status: 'blocked', error: failureMessage };
            }
            if (id === requestId.current && key === latestKey.current) {
                setSnapshot({ key, result });
            }
        }, 300);
        return () => {
            window.clearTimeout(timer);
            ++requestId.current;
        };
    }, [enabled, key, projectName, destination, failureMessage]);

    /** Rechecks immediately before any identity prompt or installation. */
    const checkNow = async (): Promise<boolean> => {
        if (!enabled) return false;
        const id = ++requestId.current;
        setCheckingNow(true);
        let result: CreateProjectDestinationInspection;
        try {
            result = await projectsBridge.inspectCreateProjectDestination(
                projectName,
                destination,
            );
        } catch {
            result = { status: 'blocked', error: failureMessage };
        } finally {
            setCheckingNow(false);
        }
        if (id !== requestId.current || key !== latestKey.current) return false;
        setSnapshot({ key, result });
        return result.status === 'available';
    };

    const result = snapshot?.key === key ? snapshot.result : null;
    return {
        status: !enabled
            ? 'idle'
            : checkingNow || !result
              ? 'checking'
              : result.status,
        error: result?.status === 'blocked' ? result.error : undefined,
        checkingNow,
        checkNow,
    };
}
