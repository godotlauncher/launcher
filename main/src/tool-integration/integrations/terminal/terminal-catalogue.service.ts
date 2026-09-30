import { Injectable } from '@mariodebono/di';
import type { TerminalSummary } from '@shared/contracts';
import logger from 'electron-log';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from '../../tool-integration.store.js';
import type { TerminalTarget } from './terminal.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalAdapterService } from './terminal-adapter.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalConfigurationService } from './terminal-configuration.service.js';

/** Coordinates one terminal catalogue and prevents stale scans publishing. */
@Injectable()
export class TerminalCatalogueService {
    private generation = 0;
    private snapshot: TerminalSummary | null = null;
    private flight: Promise<TerminalSummary> | null = null;

    /**
     * Creates the shared terminal catalogue.
     * @param adapters - Native installation discovery.
     * @param configuration - Versioned preferences.
     * @param store - Integration enabled state.
     */
    constructor(
        private readonly adapters: TerminalAdapterService,
        private readonly configuration: TerminalConfigurationService,
        private readonly store: ToolIntegrationStore,
    ) {}

    /** Invalidates outstanding scans after a preference or enabled-state change. */
    invalidate(): void {
        this.generation++;
        this.snapshot = null;
        this.flight = null;
    }

    /**
     * Reads or rescans the catalogue for the current preference generation.
     * @param force - Whether to repeat native installation discovery.
     */
    async get(force = false): Promise<TerminalSummary> {
        if (!force && this.snapshot) return this.snapshot;
        if (this.flight) return this.flight;
        const generation = this.generation;
        const flight = this.scan()
            .then((summary) => {
                if (generation !== this.generation) return this.get();
                this.snapshot = summary;
                return summary;
            })
            .finally(() => {
                if (this.flight === flight) this.flight = null;
            });
        this.flight = flight;
        return flight;
    }

    /** Resolves the editor terminal independently of Open Terminal Here's enabled state. */
    async getEditorLaunchTarget(): Promise<TerminalTarget | undefined> {
        const summary = await this.get(true);
        return summary.configurationValid
            ? this.selectTarget(summary.selection, summary.targets)
            : undefined;
    }

    /**
     * Applies explicit selection or the automatic desktop preference.
     * @param selection - Current platform terminal preference.
     * @param targets - Available compiled terminal candidates.
     */
    private selectTarget(
        selection: string,
        targets: TerminalTarget[],
    ): TerminalTarget | undefined {
        const ordered = [...targets];
        if (
            process.platform === 'linux' &&
            /(^|:)KDE(:|$)/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')
        ) {
            ordered.sort(
                (a, b) =>
                    Number(b.id === 'konsole') - Number(a.id === 'konsole'),
            );
        }
        return selection === 'automatic'
            ? ordered[0]
            : targets.find((target) => target.id === selection);
    }

    /** Discovers installations and applies only the current platform preference. */
    private async scan(): Promise<TerminalSummary> {
        const [configuration, settings, targets] = await Promise.all([
            this.configuration.get(),
            this.store.get('terminal'),
            this.adapters.discover(),
        ]);
        const selected = this.selectTarget(configuration.selection, targets);
        if (process.platform === 'linux')
            logger.info('[Terminal] Linux terminal selection', {
                selection: configuration.selection,
                enabled: settings.enabled,
                configurationValid: configuration.valid,
                resolvedTargetId:
                    settings.enabled && configuration.valid
                        ? (selected?.id ?? null)
                        : null,
            });
        return {
            enabled: settings.enabled,
            selection: configuration.selection,
            configurationValid: configuration.valid,
            targets,
            resolvedTargetId:
                settings.enabled && configuration.valid
                    ? (selected?.id ?? null)
                    : null,
        };
    }
}
