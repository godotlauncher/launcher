import type { GitIdentity } from '../projects/index.js';
import type {
    GitIdentitySettings,
    ProjectGitIdentityPreset,
    SaveGlobalGitIdentityResult,
    SaveProjectGitIdentityPresetResult,
} from './git-identity.types.js';

/** Renderer-safe Git domain operations. */
export type GitBridge = {
    /**
     * Gets independently configured global Git identity values.
     *
     * @returns The global Git name and email, including partial identity.
     */
    getGlobalIdentity(): Promise<GitIdentity>;

    /**
     * Gets global Git identity and the separate Launcher-owned project preset.
     *
     * @returns Current global and preset identity settings.
     */
    getIdentitySettings(): Promise<GitIdentitySettings>;

    /**
     * Saves the machine-wide global Git identity.
     *
     * @param identity - Complete name and email to write through Git.
     * @returns Success state and the freshly read global identity.
     */
    saveGlobalIdentity(
        identity: GitIdentity,
    ): Promise<SaveGlobalGitIdentityResult>;

    /**
     * Saves or clears the Launcher-owned project identity preset.
     *
     * @param preset - Complete preset to save, or null to clear it.
     * @returns Success state and the resulting stored preset.
     */
    saveProjectIdentityPreset(
        preset: ProjectGitIdentityPreset | null,
    ): Promise<SaveProjectGitIdentityPresetResult>;
};
