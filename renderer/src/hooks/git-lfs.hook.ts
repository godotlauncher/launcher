import type { GitLfsTrackingPolicyDescriptor } from '@shared/contracts';
import { useCallback } from 'react';
import { gitLfsBridge } from '../bridge.ts';

export type GitLfsHook = {
    getTrackingPolicy: () => Promise<GitLfsTrackingPolicyDescriptor>;
};

/**
 * Provides stable functions for renderer-safe Git LFS domain information.
 *
 * @returns The canonical Git LFS tracking policy operation.
 */
export function useGitLfs(): GitLfsHook {
    const getTrackingPolicy = useCallback(
        () => gitLfsBridge.getTrackingPolicy(),
        [],
    );

    return { getTrackingPolicy };
}
