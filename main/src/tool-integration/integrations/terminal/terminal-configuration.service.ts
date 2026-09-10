import { Injectable } from '@mariodebono/di';
import type { TerminalSelection } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationStore } from '../../tool-integration.store.js';

/** Reads and preserves the versioned per-platform terminal preference. */
@Injectable()
export class TerminalConfigurationService {
    /**
     * Creates the terminal preference boundary.
     * @param store - Shared atomic tool configuration store.
     */
    constructor(private readonly store: ToolIntegrationStore) {}

    /** Gets the current platform preference without repairing unknown data. */
    async get(): Promise<{ valid: boolean; selection: string }> {
        return readTerminalConfiguration(
            await this.store.getConfiguration('terminal'),
            process.platform,
        );
    }

    /**
     * Saves the selected target while preserving other operating systems.
     * @param selection - Validated compiled target identifier or Automatic.
     */
    async select(selection: TerminalSelection): Promise<void> {
        await this.store.updateConfiguration('terminal', (current) => {
            if (!readTerminalConfiguration(current, process.platform).valid) {
                throw new Error('Unsupported terminal configuration');
            }
            const preferences = (current.preferences ?? {}) as Record<
                string,
                string
            >;
            return {
                ...current,
                version: 1,
                preferences: { ...preferences, [process.platform]: selection },
            };
        });
    }
}

/**
 * Interprets only supported configuration without overwriting future data.
 * @param configuration - Provider-owned stored object.
 * @param platform - Current operating system key.
 */
export function readTerminalConfiguration(
    configuration: Record<string, unknown>,
    platform: string,
): { valid: boolean; selection: string } {
    if (Object.keys(configuration).length === 0)
        return { valid: true, selection: 'automatic' };
    const preferences = configuration.preferences;
    if (
        configuration.version !== 1 ||
        !preferences ||
        typeof preferences !== 'object' ||
        Array.isArray(preferences) ||
        Object.values(preferences).some((value) => typeof value !== 'string')
    ) {
        return { valid: false, selection: 'automatic' };
    }
    return {
        valid: true,
        selection:
            (preferences as Record<string, string>)[platform] ?? 'automatic',
    };
}
