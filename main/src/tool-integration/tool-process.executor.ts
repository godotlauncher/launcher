import { execFile } from 'node:child_process';
import { Injectable } from '@mariodebono/di';
import {
    TOOL_DEFAULT_EXECUTION_TIMEOUT_MS,
    TOOL_MAX_EXECUTION_TIMEOUT_MS,
} from './tool-integration.constants.js';
import type {
    ToolExecutionRequest,
    ToolExecutionResult,
    ToolInstallation,
} from './tool-integration.types.js';

@Injectable()
export class ToolProcessExecutor {
    /**
     * Executes an exact validated tool command without invoking a shell.
     *
     * @param installation - Validated executable path and prefix arguments.
     * @param request - Operation-specific arguments and process options.
     * @returns Structured process output and failure state.
     */
    execute(
        installation: ToolInstallation,
        request: ToolExecutionRequest,
    ): Promise<ToolExecutionResult> {
        const timeout = this.resolveTimeout(request.timeoutMs);
        return new Promise((resolve) => {
            try {
                execFile(
                    installation.executablePath,
                    [...installation.executableArgs, ...request.args],
                    {
                        cwd: request.cwd,
                        env: request.env
                            ? { ...process.env, ...request.env }
                            : process.env,
                        encoding: 'utf8',
                        shell: false,
                        timeout,
                        windowsHide: true,
                    },
                    (error, stdout, stderr) => {
                        if (!error) {
                            resolve({
                                success: true,
                                stdout,
                                stderr,
                                exitCode: 0,
                            });
                            return;
                        }

                        const exitCode =
                            typeof error.code === 'number' ? error.code : null;
                        resolve({
                            success: false,
                            reason: error.killed
                                ? 'timed-out'
                                : 'command-failed',
                            stdout,
                            stderr,
                            exitCode,
                        });
                    },
                );
            } catch {
                resolve({
                    success: false,
                    reason: 'command-failed',
                    stdout: '',
                    stderr: '',
                    exitCode: null,
                });
            }
        });
    }

    /**
     * Clamps requested timeouts to a bounded process lifetime.
     *
     * @param timeoutMs - Optional caller-requested timeout.
     * @returns Safe timeout in milliseconds.
     */
    private resolveTimeout(timeoutMs: number | undefined): number {
        if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
            return TOOL_DEFAULT_EXECUTION_TIMEOUT_MS;
        }
        return Math.min(
            Math.max(1, Math.floor(timeoutMs)),
            TOOL_MAX_EXECUTION_TIMEOUT_MS,
        );
    }
}
