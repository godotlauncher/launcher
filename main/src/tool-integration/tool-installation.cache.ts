import { Injectable } from '@mariodebono/di';
import {
    TOOL_NEGATIVE_REFRESH_INTERVAL_MS,
    TOOL_POSITIVE_REFRESH_INTERVAL_MS,
} from './tool-integration.constants.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationRegistry } from './tool-integration.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from './tool-integration.store.js';
import type {
    ToolId,
    ToolInstallation,
    ToolResolution,
    ToolSettings,
} from './tool-integration.types.js';

type ResolutionMode = 'refresh' | 'require' | 'rescan';

type InstallationCacheEntry = ToolResolution & {
    settingsKey: string;
};

@Injectable()
export class ToolInstallationCache {
    private readonly entries = new Map<ToolId, InstallationCacheEntry>();
    private readonly inFlight = new Map<string, Promise<ToolResolution>>();

    /**
     * Creates the installation cache.
     *
     * @param registry - Registry used to resolve tool providers.
     * @param settingsStore - Store used to hydrate and persist snapshots.
     */
    constructor(
        private readonly registry: ToolIntegrationRegistry,
        private readonly settingsStore: ToolIntegrationStore,
    ) {}

    /**
     * Reads the current in-memory or persisted snapshot without scanning.
     *
     * @param toolId - Stable tool ID to read.
     * @param settings - Settings that determine the installation candidate.
     * @returns The best current installation snapshot.
     */
    async getSnapshot(
        toolId: ToolId,
        settings: ToolSettings,
    ): Promise<ToolResolution> {
        const settingsKey = this.createSettingsKey(settings);
        const current = this.getCurrent(toolId, settingsKey);
        if (current) {
            return this.toResolution(current);
        }

        const persisted =
            await this.settingsStore.getDetectedInstallation(toolId);
        if (!persisted || persisted.settingsKey !== settingsKey) {
            return {
                installation: null,
                status: 'unchecked',
                checkedAt: null,
            };
        }

        const entry: InstallationCacheEntry = {
            settingsKey,
            installation: persisted.installation,
            status: persisted.installation
                ? 'unchecked'
                : this.hasExecutionOverride(settings)
                  ? 'invalid'
                  : 'missing',
            checkedAt: persisted.checkedAt,
        };
        this.entries.set(toolId, entry);
        return this.toResolution(entry);
    }

    /**
     * Refreshes stale state while respecting positive and negative intervals.
     *
     * @param toolId - Stable tool ID to refresh.
     * @param settings - Settings that determine the installation candidate.
     * @returns The refreshed installation state.
     */
    async refresh(
        toolId: ToolId,
        settings: ToolSettings,
    ): Promise<ToolResolution> {
        return this.resolve(toolId, settings, 'refresh');
    }

    /**
     * Performs a fresh discovery regardless of cached state.
     *
     * @param toolId - Stable tool ID to scan.
     * @param settings - Settings that determine the installation candidate.
     * @returns The newly detected installation state.
     */
    async rescan(
        toolId: ToolId,
        settings: ToolSettings,
    ): Promise<ToolResolution> {
        return this.resolve(toolId, settings, 'rescan');
    }

    /**
     * Revalidates an installation immediately before command execution.
     *
     * @param toolId - Stable tool ID that will be executed.
     * @param settings - Settings that determine the installation candidate.
     * @returns A currently validated installation state.
     */
    async requireAvailable(
        toolId: ToolId,
        settings: ToolSettings,
    ): Promise<ToolResolution> {
        return this.resolve(toolId, settings, 'require');
    }

    /**
     * Removes cached state for a tool after its settings change.
     *
     * @param toolId - Stable tool ID to invalidate.
     */
    invalidate(toolId: ToolId): void {
        this.entries.delete(toolId);
    }

    /**
     * Coordinates refresh, rescan, and pre-execution validation modes.
     *
     * @param toolId - Stable tool ID to resolve.
     * @param settings - Settings that determine the installation candidate.
     * @param mode - Resolution behavior to apply.
     * @returns The resolved installation state.
     */
    private async resolve(
        toolId: ToolId,
        settings: ToolSettings,
        mode: ResolutionMode,
    ): Promise<ToolResolution> {
        const settingsKey = this.createSettingsKey(settings);
        return this.runSingleFlight(toolId, settingsKey, mode, async () => {
            if (mode === 'rescan') {
                return this.discover(toolId, settings, settingsKey);
            }

            const snapshot = await this.getSnapshot(toolId, settings);
            if (mode === 'refresh' && this.isFresh(snapshot)) {
                return snapshot;
            }

            if (
                mode === 'require' &&
                !snapshot.installation &&
                this.isFresh(snapshot)
            ) {
                return snapshot;
            }

            if (snapshot.installation) {
                const validated = await this.registry
                    .get(toolId)
                    .validateInstallation(snapshot.installation);
                if (validated) {
                    return this.store(
                        toolId,
                        settingsKey,
                        validated,
                        'available',
                    );
                }
                if (this.hasExecutionOverride(settings)) {
                    return this.store(toolId, settingsKey, null, 'invalid');
                }
            }

            if (
                mode === 'refresh' &&
                snapshot.status === 'missing' &&
                this.isFresh(snapshot)
            ) {
                return snapshot;
            }

            return this.discover(toolId, settings, settingsKey);
        });
    }

    /**
     * Discovers and validates an installation through its provider.
     *
     * @param toolId - Stable tool ID to discover.
     * @param settings - Settings used by provider discovery.
     * @param settingsKey - Fingerprint of settings used for discovery.
     * @returns The detected installation state.
     */
    private async discover(
        toolId: ToolId,
        settings: ToolSettings,
        settingsKey: string,
    ): Promise<ToolResolution> {
        const integration = this.registry.get(toolId);
        const detected = await integration.detectInstallation(settings);
        const validated = detected
            ? await integration.validateInstallation(detected)
            : null;
        const status = validated
            ? 'available'
            : this.hasExecutionOverride(settings)
              ? 'invalid'
              : 'missing';

        return this.store(toolId, settingsKey, validated, status);
    }

    /**
     * Saves a resolution in memory and preferences.
     *
     * @param toolId - Stable tool ID whose state should be stored.
     * @param settingsKey - Fingerprint of the settings used.
     * @param installation - Valid installation or null.
     * @param status - Status derived from validation.
     * @returns The stored resolution.
     */
    private async store(
        toolId: ToolId,
        settingsKey: string,
        installation: ToolInstallation | null,
        status: 'available' | 'invalid' | 'missing',
    ): Promise<ToolResolution> {
        const checkedAt = Date.now();
        const entry: InstallationCacheEntry = {
            settingsKey,
            installation,
            status,
            checkedAt,
        };
        this.entries.set(toolId, entry);
        await this.settingsStore.setDetectedInstallation(
            toolId,
            installation,
            checkedAt,
            settingsKey,
        );
        return this.toResolution(entry);
    }

    /**
     * Reports whether a snapshot is still inside its refresh interval.
     *
     * @param resolution - Installation state to evaluate.
     * @returns Whether the state can be reused for a normal refresh.
     */
    private isFresh(resolution: ToolResolution): boolean {
        if (
            resolution.checkedAt === null ||
            resolution.status === 'unchecked'
        ) {
            return false;
        }
        const interval = resolution.installation
            ? TOOL_POSITIVE_REFRESH_INTERVAL_MS
            : TOOL_NEGATIVE_REFRESH_INTERVAL_MS;
        return Date.now() - resolution.checkedAt < interval;
    }

    /**
     * Returns an entry only when it matches the current settings fingerprint.
     *
     * @param toolId - Stable tool ID to read.
     * @param settingsKey - Current settings fingerprint.
     * @returns A matching in-memory entry when present.
     */
    private getCurrent(
        toolId: ToolId,
        settingsKey: string,
    ): InstallationCacheEntry | undefined {
        const entry = this.entries.get(toolId);
        return entry?.settingsKey === settingsKey ? entry : undefined;
    }

    /**
     * Builds a deterministic fingerprint for installation-affecting settings.
     *
     * @param settings - Tool settings to fingerprint.
     * @returns Stable serialized settings key.
     */
    private createSettingsKey(settings: ToolSettings): string {
        return JSON.stringify([
            settings.executablePathOverride,
            settings.executableArgsOverride,
        ]);
    }

    /**
     * Reports whether settings explicitly replace part of the command spec.
     *
     * @param settings - Tool settings to inspect.
     * @returns Whether path or prefix arguments were overridden.
     */
    private hasExecutionOverride(settings: ToolSettings): boolean {
        return (
            settings.executablePathOverride !== null ||
            settings.executableArgsOverride !== null
        );
    }

    /**
     * Shares one in-flight resolution among concurrent callers.
     *
     * @param toolId - Stable tool ID being resolved.
     * @param settingsKey - Current settings fingerprint.
     * @param mode - Resolution mode used to separate forced rescans.
     * @param operation - Resolution operation to run once.
     * @returns The shared resolution promise.
     */
    private runSingleFlight(
        toolId: ToolId,
        settingsKey: string,
        mode: ResolutionMode,
        operation: () => Promise<ToolResolution>,
    ): Promise<ToolResolution> {
        const flightKey = `${toolId}\0${settingsKey}\0${mode}`;
        const existing = this.inFlight.get(flightKey);
        if (existing) {
            return existing;
        }

        const flight = operation().finally(() => {
            if (this.inFlight.get(flightKey) === flight) {
                this.inFlight.delete(flightKey);
            }
        });
        this.inFlight.set(flightKey, flight);
        return flight;
    }

    /**
     * Copies an internal cache entry into its public resolution shape.
     *
     * @param entry - Internal cache entry to copy.
     * @returns Installation resolution without the settings fingerprint.
     */
    private toResolution(entry: InstallationCacheEntry): ToolResolution {
        return {
            installation: entry.installation
                ? {
                      ...entry.installation,
                      executableArgs: [...entry.installation.executableArgs],
                  }
                : null,
            status: entry.status,
            checkedAt: entry.checkedAt,
        };
    }
}
