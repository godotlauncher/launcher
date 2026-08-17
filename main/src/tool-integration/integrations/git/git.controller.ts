import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    GitBridge,
    GitIdentity,
    GitIdentitySettings,
    ProjectGitIdentityPreset,
    SaveGlobalGitIdentityResult,
    SaveProjectGitIdentityPresetResult,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitIdentitySettingsService } from './git-identity-settings.service.js';

const GitHandler = createIpcHandleTyped<GitBridge>();

/** Handles renderer-safe Git domain requests. */
@BridgeController({ namespace: 'git' })
export class GitController implements GitBridge {
    /**
     * Creates the Git bridge controller.
     *
     * @param service - Typed Git identity settings service.
     */
    constructor(private readonly service: GitIdentitySettingsService) {}

    /**
     * Gets independently configured global Git identity values.
     *
     * @returns The global Git name and email, including partial identity.
     */
    @GitHandler('getGlobalIdentity')
    getGlobalIdentity(): Promise<GitIdentity> {
        return this.service.getGlobalIdentity();
    }

    /**
     * Gets global Git identity and the separate Launcher-owned project preset.
     *
     * @returns Current global and preset identity settings.
     */
    @GitHandler('getIdentitySettings')
    getIdentitySettings(): Promise<GitIdentitySettings> {
        return this.service.getIdentitySettings();
    }

    /**
     * Saves the machine-wide global Git identity.
     *
     * @param identity - Complete name and email to write through Git.
     * @returns Success state and the freshly read global identity.
     */
    @GitHandler('saveGlobalIdentity')
    saveGlobalIdentity(
        identity: GitIdentity,
    ): Promise<SaveGlobalGitIdentityResult> {
        return this.service.saveGlobalIdentity(identity);
    }

    /**
     * Saves or clears the Launcher-owned project identity preset.
     *
     * @param preset - Complete preset to save, or null to clear it.
     * @returns Success state and the resulting stored preset.
     */
    @GitHandler('saveProjectIdentityPreset')
    saveProjectIdentityPreset(
        preset: ProjectGitIdentityPreset | null,
    ): Promise<SaveProjectGitIdentityPresetResult> {
        return this.service.saveProjectIdentityPreset(preset);
    }
}
