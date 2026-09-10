import { Injectable } from '@mariodebono/di';
import type {
    TerminalLaunchResult,
    TerminalSelection,
    TerminalSummary,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from '../../../projects/projects.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolInstallationCache } from '../../tool-installation.cache.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from '../../tool-integration.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from '../../tool-integration.store.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalAdapterService } from './terminal-adapter.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalCatalogueService } from './terminal-catalogue.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalConfigurationService } from './terminal-configuration.service.js';

/** Owns narrow terminal preferences and known-project launches. */
@Injectable()
export class TerminalService {
    /**
     * Creates the terminal workflow boundary.
     * @param catalogue - Shared candidate discovery.
     * @param configuration - Versioned target preferences.
     * @param adapters - Native terminal launch boundary.
     * @param projects - Canonical stored project identities.
     * @param store - Shared enabled settings.
     * @param cache - Generic single-installation cache.
     * @param tools - Generic tool lifecycle.
     */
    constructor(
        private readonly catalogue: TerminalCatalogueService,
        private readonly configuration: TerminalConfigurationService,
        private readonly adapters: TerminalAdapterService,
        private readonly projects: ProjectsStore,
        private readonly store: ToolIntegrationStore,
        private readonly cache: ToolInstallationCache,
        private readonly tools: ToolIntegrationService,
    ) {}

    /** Reads the terminal catalogue. */
    getSummary(): Promise<TerminalSummary> {
        return this.catalogue.get();
    }

    /** Refreshes native detection and the generic tool summary together. */
    async rescan(): Promise<TerminalSummary> {
        this.catalogue.invalidate();
        this.cache.invalidate('terminal');
        await this.tools.rescan('terminal');
        return this.catalogue.get();
    }

    /**
     * Saves a compiled target identifier for this operating system.
     * @param selection - Automatic or a target supported on this platform.
     */
    async selectTarget(selection: TerminalSelection): Promise<TerminalSummary> {
        const supported: string[] =
            process.platform === 'win32'
                ? ['windows-terminal', 'command-prompt']
                : process.platform === 'darwin'
                  ? ['macos-terminal']
                  : process.platform === 'linux'
                    ? ['gnome-terminal', 'konsole']
                    : [];
        if (selection !== 'automatic' && !supported.includes(selection))
            throw new Error('Unsupported terminal target');
        await this.configuration.select(selection);
        return this.rescan();
    }

    /**
     * Updates terminal availability without altering unknown configuration.
     * @param enabled - Whether external terminal launches are enabled.
     */
    async setEnabled(enabled: boolean): Promise<TerminalSummary> {
        if (typeof enabled !== 'boolean')
            throw new Error('Invalid terminal enabled state');
        await this.tools.updateSettings('terminal', { enabled });
        return this.rescan();
    }

    /**
     * Resolves a stored project identity before opening its exact directory.
     * @param projectPath - Exact project path used as its stored identity.
     */
    async openProject(projectPath: string): Promise<TerminalLaunchResult> {
        if (typeof projectPath !== 'string')
            return { success: false, reason: 'missing-project' };
        const project = (await this.projects.list()).find(
            (candidate) => candidate.path === projectPath,
        );
        if (!project) return { success: false, reason: 'missing-project' };
        if (!(await this.store.get('terminal')).enabled)
            return { success: false, reason: 'disabled' };
        const summary = await this.catalogue.get(true);
        if (!summary.configurationValid)
            return { success: false, reason: 'invalid-configuration' };
        if (!summary.enabled) return { success: false, reason: 'disabled' };
        const target = summary.targets.find(
            (candidate) => candidate.id === summary.resolvedTargetId,
        );
        if (!target) return { success: false, reason: 'unavailable' };
        return this.adapters.launch(target, project.path);
    }
}
