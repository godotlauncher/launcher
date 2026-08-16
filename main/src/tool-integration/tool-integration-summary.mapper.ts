import type { ToolIntegrationSummary } from '@shared/contracts';
import type { ToolSummary } from './tool-integration.types.js';

/**
 * Converts an internal tool summary into the renderer-safe bridge contract.
 *
 * @param summary - Internal summary containing settings and installation data.
 * @returns Public summary without executable arguments or execution settings.
 */
export function mapToolIntegrationSummary(
    summary: ToolSummary,
): ToolIntegrationSummary {
    return {
        id: summary.metadata.id,
        displayName: summary.metadata.displayName,
        status: summary.status,
        version: summary.installation?.version ?? null,
        executablePath: summary.installation?.executablePath ?? null,
    };
}
