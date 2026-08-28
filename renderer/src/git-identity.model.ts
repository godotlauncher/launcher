import type {
    GitIdentity,
    GitIdentityScope,
    ProjectGitIdentityPreset,
} from '@shared/contracts';

/** Checks whether both required Git identity values contain text. */
export const isGitIdentityComplete = (identity: GitIdentity): boolean =>
    identity.name.trim().length > 0 && identity.email.trim().length > 0;

export type GitIdentityDecision =
    | { action: 'use-global' }
    | { action: 'apply-preset'; preset: ProjectGitIdentityPreset }
    | {
          action: 'suggest-preset';
          preset: ProjectGitIdentityPreset;
          globalIdentity: GitIdentity;
      }
    | { action: 'require-identity'; globalIdentity: GitIdentity };

export type GitIdentitySaveChoice = 'ask' | 'local-default' | 'global-default';

export type GitIdentitySaveResolution = {
    scope: GitIdentityScope;
    preset: ProjectGitIdentityPreset | null;
};

/**
 * Resolves repository setup behaviour from global Git state and the preset.
 *
 * @param globalIdentity - Independently read global Git name and email.
 * @param projectPreset - Optional Launcher-owned project identity preset.
 * @returns The next identity step before repository setup.
 */
export function resolveGitIdentityDecision(
    globalIdentity: GitIdentity,
    projectPreset: ProjectGitIdentityPreset | null,
): GitIdentityDecision {
    if (projectPreset?.useForNewRepositories) {
        return { action: 'apply-preset', preset: projectPreset };
    }
    if (projectPreset) {
        return {
            action: 'suggest-preset',
            preset: projectPreset,
            globalIdentity,
        };
    }
    if (isGitIdentityComplete(globalIdentity)) {
        return { action: 'use-global' };
    }
    return { action: 'require-identity', globalIdentity };
}

/**
 * Resolves how a first entered identity should be saved.
 *
 * @param identity - Complete identity entered for repository setup.
 * @param choice - Future default selected by the user.
 * @param existingPreset - Preset already loaded before the form opened.
 * @returns Git scope and optional new automatic preset, or null when invalid.
 */
export function resolveGitIdentitySave(
    identity: GitIdentity,
    choice: GitIdentitySaveChoice,
    existingPreset: ProjectGitIdentityPreset | null,
): GitIdentitySaveResolution | null {
    if (!isGitIdentityComplete(identity)) {
        return null;
    }
    if (choice === 'global-default') {
        return { scope: 'global', preset: null };
    }
    if (choice === 'ask') {
        return { scope: 'repository', preset: null };
    }
    if (existingPreset) {
        return null;
    }
    return {
        scope: 'repository',
        preset: {
            name: identity.name.trim(),
            email: identity.email.trim(),
            useForNewRepositories: true,
        },
    };
}
