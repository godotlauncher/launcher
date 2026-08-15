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
    GIT_TOOL_ID,
    GIT_TOOL_ORDER,
    GIT_TOOL_VALIDATION_TIMEOUT_MS,
} from './git-tool.constants.js';

@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
export class GitToolIntegration implements ToolIntegration {
    readonly metadata = {
        id: GIT_TOOL_ID,
        displayName: 'Git',
        order: GIT_TOOL_ORDER,
    };

    /**
     * Creates the system Git integration.
     *
     * @param processExecutor - Exact process boundary used to validate Git.
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

        const executablePath = await findExecutable(GIT_TOOL_ID);
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
            timeoutMs: GIT_TOOL_VALIDATION_TIMEOUT_MS,
        });
        if (!result.success) {
            return null;
        }

        const version = normalizeGitVersion(result.stdout);
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
 * Extracts one compatible Git version line from process output.
 *
 * @param stdout - Standard output returned by `git --version`.
 * @returns The normalized first line, or null when the output is not Git.
 */
function normalizeGitVersion(stdout: string): string | null {
    const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? '';
    return /^git version\s+\S.*$/.test(firstLine) ? firstLine : null;
}
