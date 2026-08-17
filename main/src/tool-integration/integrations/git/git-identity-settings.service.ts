import { Injectable } from '@mariodebono/di';
import type {
    GitIdentity,
    GitIdentitySettings,
    ProjectGitIdentityPreset,
    SaveGlobalGitIdentityResult,
    SaveProjectGitIdentityPresetResult,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from './git.service.js';
import {
    GitIdentitySchema,
    ProjectGitIdentityPresetSchema,
} from './git-identity.schema.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitToolConfigurationService } from './git-tool-configuration.service.js';

@Injectable()
export class GitIdentitySettingsService {
    /**
     * Creates the Git identity settings service.
     *
     * @param gitService - Git command service for global configuration.
     * @param configurationService - Launcher-owned Git configuration service.
     */
    constructor(
        private readonly gitService: GitService,
        private readonly configurationService: GitToolConfigurationService,
    ) {}

    /**
     * Gets independently configured global Git identity values.
     *
     * @returns The global Git name and email, including partial identity.
     */
    getGlobalIdentity(): Promise<GitIdentity> {
        return this.gitService.getGlobalIdentity();
    }

    /**
     * Gets global Git identity and the separate Launcher-owned preset.
     *
     * @returns Current global and project preset settings.
     */
    async getIdentitySettings(): Promise<GitIdentitySettings> {
        const [globalIdentity, projectPreset] = await Promise.all([
            this.gitService.getGlobalIdentity(),
            this.configurationService.getProjectIdentityPreset(),
        ]);
        return { globalIdentity, projectPreset };
    }

    /**
     * Validates and saves the machine-wide global Git identity.
     *
     * Git is re-read after every attempted write so partial failures remain
     * visible to the caller.
     *
     * @param identity - Complete name and email received from the renderer.
     * @returns Success state and the freshly read global identity.
     */
    async saveGlobalIdentity(
        identity: GitIdentity,
    ): Promise<SaveGlobalGitIdentityResult> {
        const normalized = GitIdentitySchema.safeParse(identity);
        let success = false;
        if (normalized.success) {
            try {
                success = await this.gitService.setIdentity(
                    normalized.data.name,
                    normalized.data.email,
                    'global',
                );
            } catch {
                success = false;
            }
        }

        return {
            success,
            identity: await this.gitService.getGlobalIdentity(),
        };
    }

    /**
     * Validates and saves or clears the Launcher-owned project preset.
     *
     * @param preset - Complete preset received from the renderer, or null.
     * @returns Success state and the resulting stored preset.
     */
    async saveProjectIdentityPreset(
        preset: ProjectGitIdentityPreset | null,
    ): Promise<SaveProjectGitIdentityPresetResult> {
        const normalized =
            preset === null
                ? { success: true as const, data: null }
                : ProjectGitIdentityPresetSchema.safeParse(preset);

        if (!normalized.success) {
            return {
                success: false,
                preset:
                    await this.configurationService.getProjectIdentityPreset(),
            };
        }

        try {
            return {
                success: true,
                preset: await this.configurationService.saveProjectIdentityPreset(
                    normalized.data,
                ),
            };
        } catch {
            return {
                success: false,
                preset:
                    await this.configurationService.getProjectIdentityPreset(),
            };
        }
    }
}
