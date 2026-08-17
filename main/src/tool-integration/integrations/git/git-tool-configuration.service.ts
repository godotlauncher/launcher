import { Injectable } from '@mariodebono/di';
import type { ProjectGitIdentityPreset } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from '../../tool-integration.store.js';
import { ProjectGitIdentityPresetSchema } from './git-identity.schema.js';
import { GIT_TOOL_ID } from './git-tool.constants.js';

const PROJECT_IDENTITY_PRESET_KEY = 'projectIdentityPreset';

@Injectable()
export class GitToolConfigurationService {
    /**
     * Creates the typed Git settings wrapper.
     *
     * @param toolStore - Central store that owns atomic tool integration data.
     */
    constructor(private readonly toolStore: ToolIntegrationStore) {}

    /**
     * Reads the Launcher-owned project identity preset.
     *
     * @returns The normalized preset, or null when none is validly stored.
     */
    async getProjectIdentityPreset(): Promise<ProjectGitIdentityPreset | null> {
        const configuration =
            await this.toolStore.getConfiguration(GIT_TOOL_ID);
        const result = ProjectGitIdentityPresetSchema.safeParse(
            configuration[PROJECT_IDENTITY_PRESET_KEY],
        );
        return result.success ? result.data : null;
    }

    /**
     * Saves or clears the Launcher-owned project identity preset.
     *
     * @param preset - Complete preset to save, or null to clear it.
     * @returns The normalized stored preset, or null after clearing it.
     */
    async saveProjectIdentityPreset(
        preset: ProjectGitIdentityPreset | null,
    ): Promise<ProjectGitIdentityPreset | null> {
        const normalized = preset
            ? ProjectGitIdentityPresetSchema.parse(preset)
            : null;

        await this.toolStore.updateConfiguration(GIT_TOOL_ID, (current) => {
            if (normalized) {
                return {
                    ...current,
                    [PROJECT_IDENTITY_PRESET_KEY]: normalized,
                };
            }

            const { [PROJECT_IDENTITY_PRESET_KEY]: _removed, ...remaining } =
                current;
            return remaining;
        });
        return normalized;
    }
}
