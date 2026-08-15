import type { GitIdentity } from '@shared/contracts';
import { useCallback } from 'react';
import { gitBridge } from '../bridge.ts';

export type GitHook = {
    getGlobalIdentity: () => Promise<GitIdentity>;
};

/**
 * Provides stable functions for renderer-safe Git domain operations.
 *
 * @returns Global Git identity operations.
 */
export function useGit(): GitHook {
    const getGlobalIdentity = useCallback(
        () => gitBridge.getGlobalIdentity(),
        [],
    );

    return { getGlobalIdentity };
}
