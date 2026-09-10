import { Injectable } from '@mariodebono/di';
import { TOOL_INTEGRATION_TAG } from '../../tool-integration.constants.js';
import type {
    ToolInstallation,
    ToolIntegration,
    ToolSettings,
} from '../../tool-integration.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalAdapterService } from './terminal-adapter.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalCatalogueService } from './terminal-catalogue.service.js';

/** Projects the selected terminal into the existing single-tool summary. */
@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
export class TerminalToolIntegration implements ToolIntegration {
    readonly metadata = { id: 'terminal', displayName: 'Terminal', order: 300 };
    /**
     * Creates the compiled terminal provider.
     * @param catalogue - Shared discovery and preference generation.
     * @param adapters - Exact candidate revalidation.
     */
    constructor(
        private readonly catalogue: TerminalCatalogueService,
        private readonly adapters: TerminalAdapterService,
    ) {}

    /**
     * Resolves the selected terminal without supporting execution overrides.
     * @param settings - Integration settings supplied by the tool lifecycle.
     */
    async detectInstallation(
        settings: ToolSettings,
    ): Promise<ToolInstallation | null> {
        if (
            !settings.enabled ||
            settings.executablePathOverride !== null ||
            settings.executableArgsOverride !== null
        )
            return null;
        const summary = await this.catalogue.get(true);
        const target = summary.targets.find(
            (candidate) => candidate.id === summary.resolvedTargetId,
        );
        return target
            ? {
                  executablePath: target.executablePath,
                  executableArgs: [],
                  version: null,
                  source: 'detected',
              }
            : null;
    }

    /**
     * Revalidates only the exact currently selected compiled installation.
     * @param installation - Candidate supplied by the generic tool cache.
     */
    async validateInstallation(
        installation: ToolInstallation,
    ): Promise<ToolInstallation | null> {
        if (
            installation.source !== 'detected' ||
            installation.executableArgs.length !== 0
        )
            return null;
        const summary = await this.catalogue.get();
        const target = summary.targets.find(
            (candidate) =>
                candidate.id === summary.resolvedTargetId &&
                candidate.executablePath === installation.executablePath,
        );
        return target && (await this.adapters.isAvailable(target))
            ? installation
            : null;
    }
}
