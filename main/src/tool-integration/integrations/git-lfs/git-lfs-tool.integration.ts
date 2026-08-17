import { Injectable } from '@mariodebono/di';
import { findExecutable } from '../../../utils/platform.utils.js';
import { TOOL_INTEGRATION_TAG } from '../../tool-integration.constants.js';
import type {
    ToolInstallation,
    ToolIntegration,
    ToolSettings,
} from '../../tool-integration.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolProcessExecutor } from '../../tool-process.executor.js';
import {
    GIT_LFS_TOOL_ID,
    GIT_LFS_TOOL_ORDER,
    GIT_LFS_TOOL_VALIDATION_TIMEOUT_MS,
} from './git-lfs-tool.constants.js';

@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
export class GitLfsToolIntegration implements ToolIntegration {
    readonly metadata = {
        id: GIT_LFS_TOOL_ID,
        displayName: 'Git LFS',
        order: GIT_LFS_TOOL_ORDER,
    };

    /**
     * Creates the system Git LFS integration.
     *
     * @param processExecutor - Exact process boundary used to validate Git LFS.
     */
    constructor(private readonly processExecutor: ToolProcessExecutor) {}

    /** @inheritdoc */
    async detectInstallation(
        settings: ToolSettings,
    ): Promise<ToolInstallation | null> {
        if (
            settings.executablePathOverride !== null ||
            settings.executableArgsOverride !== null
        ) {
            return null;
        }

        const executablePath = await findExecutable(GIT_LFS_TOOL_ID);
        if (!executablePath) {
            return null;
        }

        return {
            executablePath,
            executableArgs: [],
            version: null,
            source: 'detected',
        };
    }

    /** @inheritdoc */
    async validateInstallation(
        installation: ToolInstallation,
    ): Promise<ToolInstallation | null> {
        if (
            installation.source !== 'detected' ||
            installation.executableArgs.length > 0 ||
            !installation.executablePath.trim()
        ) {
            return null;
        }

        const result = await this.processExecutor.execute(installation, {
            args: ['--version'],
            timeoutMs: GIT_LFS_TOOL_VALIDATION_TIMEOUT_MS,
        });
        if (!result.success) {
            return null;
        }

        const version = normalizeGitLfsVersion(result.stdout);
        if (!version) {
            return null;
        }

        return {
            ...installation,
            version,
        };
    }
}

/**
 * Extracts one compatible Git LFS version line from process output.
 *
 * @param stdout - Standard output returned by `git-lfs --version`.
 * @returns The normalised first line, or null when the output is not Git LFS.
 */
function normalizeGitLfsVersion(stdout: string): string | null {
    const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? '';
    return /^git-lfs\/\S+(?:\s+.*)?$/.test(firstLine) ? firstLine : null;
}
