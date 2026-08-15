import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolInstallationCache } from './tool-installation.cache.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationRegistry } from './tool-integration.registry.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from './tool-integration.store.js';
import type {
    ToolExecutionRequest,
    ToolExecutionResult,
    ToolId,
    ToolSettings,
    ToolSummary,
    UpdateToolSettings,
} from './tool-integration.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolProcessExecutor } from './tool-process.executor.js';

@Injectable()
export class ToolIntegrationService {
    /**
     * Creates the consumer-facing tool lifecycle facade.
     *
     * @param registry - Registry of statically compiled tool providers.
     * @param settingsStore - Store for per-tool settings and snapshots.
     * @param installationCache - Cache for discovery and revalidation.
     * @param processExecutor - Main-process command execution boundary.
     */
    constructor(
        private readonly registry: ToolIntegrationRegistry,
        private readonly settingsStore: ToolIntegrationStore,
        private readonly installationCache: ToolInstallationCache,
        private readonly processExecutor: ToolProcessExecutor,
    ) {}

    /**
     * Lists current summaries without triggering installation scans.
     *
     * @returns Registered tool summaries in deterministic order.
     */
    async list(): Promise<ToolSummary[]> {
        return Promise.all(
            this.registry
                .list()
                .map((integration) => this.get(integration.metadata.id)),
        );
    }

    /**
     * Reads one current tool summary without scanning.
     *
     * @param toolId - Stable tool ID to read.
     * @returns Current tool settings and installation snapshot.
     */
    async get(toolId: ToolId): Promise<ToolSummary> {
        const settings = await this.settingsStore.get(toolId);
        if (!settings.enabled) {
            return this.toDisabledSummary(toolId, settings);
        }
        const resolution = await this.installationCache.getSnapshot(
            toolId,
            settings,
        );
        return {
            metadata: this.registry.get(toolId).metadata,
            settings,
            ...resolution,
        };
    }

    /**
     * Refreshes one tool when its current state is stale.
     *
     * @param toolId - Stable tool ID to refresh.
     * @returns Refreshed tool summary.
     */
    async refresh(toolId: ToolId): Promise<ToolSummary> {
        const settings = await this.settingsStore.get(toolId);
        if (!settings.enabled) {
            return this.toDisabledSummary(toolId, settings);
        }
        const resolution = await this.installationCache.refresh(
            toolId,
            settings,
        );
        return {
            metadata: this.registry.get(toolId).metadata,
            settings,
            ...resolution,
        };
    }

    /**
     * Forces discovery for one tool regardless of cached state.
     *
     * @param toolId - Stable tool ID to rescan.
     * @returns Newly detected tool summary.
     */
    async rescan(toolId: ToolId): Promise<ToolSummary> {
        const settings = await this.settingsStore.get(toolId);
        if (!settings.enabled) {
            return this.toDisabledSummary(toolId, settings);
        }
        const resolution = await this.installationCache.rescan(
            toolId,
            settings,
        );
        return {
            metadata: this.registry.get(toolId).metadata,
            settings,
            ...resolution,
        };
    }

    /**
     * Forces discovery for every registered tool.
     *
     * @returns Newly detected summaries in deterministic order.
     */
    async rescanAll(): Promise<ToolSummary[]> {
        return Promise.all(
            this.registry
                .list()
                .map((integration) => this.rescan(integration.metadata.id)),
        );
    }

    /**
     * Reads normalized settings for one registered tool.
     *
     * @param toolId - Stable tool ID whose settings should be read.
     * @returns Current tool settings.
     */
    getSettings(toolId: ToolId): Promise<ToolSettings> {
        this.registry.get(toolId);
        return this.settingsStore.get(toolId);
    }

    /**
     * Validates and stores settings that affect tool execution.
     *
     * @param toolId - Stable tool ID whose settings should be updated.
     * @param update - Partial settings update.
     * @returns Summary resolved from the updated settings.
     */
    async updateSettings(
        toolId: ToolId,
        update: UpdateToolSettings,
    ): Promise<ToolSummary> {
        const integration = this.registry.get(toolId);
        const current = await this.settingsStore.get(toolId);
        const next = this.settingsStore.normalize({ ...current, ...update });

        if (
            next.enabled &&
            (next.executablePathOverride || next.executableArgsOverride)
        ) {
            const detected = await integration.detectInstallation(next);
            const validated = detected
                ? await integration.validateInstallation(detected)
                : null;
            if (!validated) {
                throw new Error(`Invalid tool execution override: ${toolId}`);
            }
        }

        const settings = await this.settingsStore.update(toolId, update);
        this.installationCache.invalidate(toolId);
        if (!settings.enabled) {
            return this.toDisabledSummary(toolId, settings);
        }
        const resolution = await this.installationCache.rescan(
            toolId,
            settings,
        );
        return {
            metadata: integration.metadata,
            settings,
            ...resolution,
        };
    }

    /**
     * Revalidates and executes one tool through its exact command specification.
     *
     * @param toolId - Stable tool ID to execute.
     * @param request - Operation-specific arguments and process options.
     * @returns Structured execution output or availability failure.
     */
    async execute(
        toolId: ToolId,
        request: ToolExecutionRequest,
    ): Promise<ToolExecutionResult> {
        this.registry.get(toolId);
        const settings = await this.settingsStore.get(toolId);
        if (!settings.enabled) {
            return this.createUnavailableResult('disabled');
        }

        const resolution = await this.installationCache.requireAvailable(
            toolId,
            settings,
        );
        if (!resolution.installation) {
            return this.createUnavailableResult(
                resolution.status === 'invalid' ? 'invalid' : 'unavailable',
            );
        }

        return this.processExecutor.execute(resolution.installation, request);
    }

    /**
     * Creates a summary for a disabled tool without resolving installation state.
     *
     * @param toolId - Stable tool ID represented by the summary.
     * @param settings - Disabled tool settings.
     * @returns Disabled tool summary.
     */
    private toDisabledSummary(
        toolId: ToolId,
        settings: ToolSettings,
    ): ToolSummary {
        return {
            metadata: this.registry.get(toolId).metadata,
            settings,
            installation: null,
            status: 'disabled',
            checkedAt: null,
        };
    }

    /**
     * Creates a structured failure before a child process is started.
     *
     * @param reason - Availability reason that prevented execution.
     * @returns Empty execution failure result.
     */
    private createUnavailableResult(
        reason: 'disabled' | 'invalid' | 'unavailable',
    ): ToolExecutionResult {
        return {
            success: false,
            reason,
            stdout: '',
            stderr: '',
            exitCode: null,
        };
    }
}
