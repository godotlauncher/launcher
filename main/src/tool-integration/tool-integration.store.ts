import path from 'node:path';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import {
    createDefaultStoredToolState,
    createDefaultToolSettings,
    createEmptyToolIntegrationStore,
    normalizeToolIntegrationStore,
    normalizeToolSettings,
} from './tool-integration.schema.js';
import type {
    StoredToolInstallation,
    ToolId,
    ToolInstallation,
    ToolIntegrationModuleOptions,
    ToolIntegrationStoreFile,
    ToolSettings,
    UpdateToolSettings,
} from './tool-integration.types.js';

export class ToolIntegrationStore extends JsonFileStore<ToolIntegrationStoreFile> {
    /**
     * Creates the feature-owned tool integration JSON store.
     *
     * @param coordinator - Service that coordinates atomic JSON operations.
     * @param options - Directory and file name used by the store.
     */
    constructor(
        coordinator: JsonStoreCoordinatorService,
        options: ToolIntegrationModuleOptions,
    ) {
        super(coordinator, {
            pathProvider: () =>
                path.resolve(options.directory, options.fileName),
            defaultValue: createEmptyToolIntegrationStore,
            parse: (raw) => normalizeToolIntegrationStore(JSON.parse(raw)),
            normalize: normalizeToolIntegrationStore,
        });
    }

    /**
     * Reads normalized settings for one tool.
     *
     * @param toolId - Stable tool ID whose settings should be read.
     * @returns Normalized settings with defaults applied.
     */
    async get(toolId: ToolId): Promise<ToolSettings> {
        const current = await this.readValue();
        return (
            current.value.tools[toolId]?.settings ?? createDefaultToolSettings()
        );
    }

    /**
     * Applies a partial settings update without replacing other tool records.
     *
     * @param toolId - Stable tool ID whose settings should be updated.
     * @param update - Settings fields to update.
     * @returns The normalized stored settings.
     */
    async update(
        toolId: ToolId,
        update: UpdateToolSettings,
    ): Promise<ToolSettings> {
        let storedSettings = createDefaultToolSettings();
        await this.updateValue((current) => {
            const currentTool =
                current.tools[toolId] ?? createDefaultStoredToolState();
            storedSettings = this.normalize({
                ...currentTool.settings,
                ...update,
            });

            return {
                ...current,
                tools: {
                    ...current.tools,
                    [toolId]: {
                        ...currentTool,
                        settings: storedSettings,
                    },
                },
            };
        });
        return storedSettings;
    }

    /**
     * Reads the installation snapshot for the current platform and architecture.
     *
     * @param toolId - Stable tool ID whose installation should be read.
     * @returns The stored snapshot when one exists.
     */
    async getDetectedInstallation(
        toolId: ToolId,
    ): Promise<StoredToolInstallation | undefined> {
        const current = await this.readValue();
        return current.value.tools[toolId]?.installations?.[process.platform]?.[
            process.arch
        ];
    }

    /**
     * Stores an installation snapshot for the current platform and architecture.
     *
     * @param toolId - Stable tool ID whose installation should be stored.
     * @param installation - Valid installation, or null for a negative scan.
     * @param checkedAt - Time at which resolution completed.
     * @param settingsKey - Fingerprint of settings used for resolution.
     */
    async setDetectedInstallation(
        toolId: ToolId,
        installation: ToolInstallation | null,
        checkedAt: number,
        settingsKey: string,
    ): Promise<void> {
        await this.updateValue((current) => {
            const currentTool =
                current.tools[toolId] ?? createDefaultStoredToolState();
            return {
                ...current,
                tools: {
                    ...current.tools,
                    [toolId]: {
                        ...currentTool,
                        installations: {
                            ...currentTool.installations,
                            [process.platform]: {
                                ...currentTool.installations[process.platform],
                                [process.arch]: {
                                    installation,
                                    checkedAt,
                                    settingsKey,
                                },
                            },
                        },
                    },
                },
            };
        });
    }

    /**
     * Normalizes settings received from persistence or callers.
     *
     * @param settings - Partial or complete settings to normalize.
     * @returns Complete normalized settings.
     */
    normalize(settings: Partial<ToolSettings>): ToolSettings {
        return normalizeToolSettings(settings);
    }
}
