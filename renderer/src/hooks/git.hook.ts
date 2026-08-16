import type {
    GitIdentity,
    GitIdentitySettings,
    ProjectGitIdentityPreset,
    SaveGlobalGitIdentityResult,
    SaveProjectGitIdentityPresetResult,
} from '@shared/contracts';
import { useCallback } from 'react';
import { gitBridge } from '../bridge.ts';

export type GitHook = {
    getGlobalIdentity: () => Promise<GitIdentity>;
    getIdentitySettings: () => Promise<GitIdentitySettings>;
    saveGlobalIdentity: (
        identity: GitIdentity,
    ) => Promise<SaveGlobalGitIdentityResult>;
    saveProjectIdentityPreset: (
        preset: ProjectGitIdentityPreset | null,
    ) => Promise<SaveProjectGitIdentityPresetResult>;
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
    const getIdentitySettings = useCallback(
        () => gitBridge.getIdentitySettings(),
        [],
    );
    const saveGlobalIdentity = useCallback(
        (identity: GitIdentity) => gitBridge.saveGlobalIdentity(identity),
        [],
    );
    const saveProjectIdentityPreset = useCallback(
        (preset: ProjectGitIdentityPreset | null) =>
            gitBridge.saveProjectIdentityPreset(preset),
        [],
    );

    return {
        getGlobalIdentity,
        getIdentitySettings,
        saveGlobalIdentity,
        saveProjectIdentityPreset,
    };
}
