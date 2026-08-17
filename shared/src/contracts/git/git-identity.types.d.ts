import type { GitIdentity } from '../projects/index.js';

/** A Launcher-owned identity with no effect until written to a repository. */
export type ProjectGitIdentityPreset = GitIdentity & {
    useForNewRepositories: boolean;
};

/** Global Git state and the separate Launcher-owned project preset. */
export type GitIdentitySettings = {
    globalIdentity: GitIdentity;
    projectPreset: ProjectGitIdentityPreset | null;
};

/** Result of writing the machine-wide global Git identity. */
export type SaveGlobalGitIdentityResult = {
    success: boolean;
    identity: GitIdentity;
};

/** Result of saving or clearing the Launcher-owned project preset. */
export type SaveProjectGitIdentityPresetResult = {
    success: boolean;
    preset: ProjectGitIdentityPreset | null;
};
