import type { CachedTool, InstalledTool } from '@shared/contracts';
import type { ToolSummary } from './tool-integration.types.js';

/**
 * Converts tool summaries to the temporary installed-tool bridge shape.
 *
 * @param summaries - Internal tool integration summaries.
 * @returns Installed tools that have a resolved installation.
 */
export function mapToolSummariesToInstalledTools(
    summaries: ToolSummary[],
): InstalledTool[] {
    return summaries.flatMap((summary) =>
        summary.installation
            ? [
                  {
                      name: summary.metadata.displayName,
                      path: summary.installation.executablePath,
                      version: summary.installation.version,
                  },
              ]
            : [],
    );
}

/**
 * Converts tool summaries to the temporary cached-tool bridge shape.
 *
 * @param summaries - Internal tool integration summaries.
 * @returns Cached tools that have a resolved installation.
 */
export function mapToolSummariesToCachedTools(
    summaries: ToolSummary[],
): CachedTool[] {
    return summaries.flatMap((summary) =>
        summary.installation
            ? [
                  {
                      name: summary.metadata.displayName,
                      path: summary.installation.executablePath,
                      version: summary.installation.version,
                      verified: summary.status === 'available',
                  },
              ]
            : [],
    );
}
