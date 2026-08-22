import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { Injectable } from '@mariodebono/di';
import type {
    ToolInstallation,
    ToolStreamingExecutionRequest,
    ToolStreamingExecutionResult,
} from './tool-integration.types.js';

const FORCE_KILL_DELAY_MS = 2_000;
type StreamingChildProcess = ChildProcessByStdio<null, Readable, Readable>;

@Injectable()
export class ToolStreamingProcessExecutor {
    /**
     * Starts one validated long-running tool process without a shell.
     *
     * @param installation - Revalidated executable and fixed prefix arguments.
     * @param request - Complete streaming process request.
     * @returns The terminal process state without buffered child output.
     */
    execute(
        installation: ToolInstallation,
        request: ToolStreamingExecutionRequest,
    ): Promise<ToolStreamingExecutionResult> {
        if (request.signal.aborted) {
            return Promise.resolve({
                success: false,
                reason: 'cancelled',
                exitCode: null,
            });
        }

        return new Promise((resolve) => {
            let child: StreamingChildProcess;
            try {
                child = spawn(
                    installation.executablePath,
                    [...installation.executableArgs, ...request.args],
                    {
                        cwd: request.cwd,
                        env: request.env,
                        shell: false,
                        windowsHide: true,
                        stdio: ['ignore', 'pipe', 'pipe'],
                    },
                );
            } catch {
                resolve({
                    success: false,
                    reason: 'command-failed',
                    exitCode: null,
                });
                return;
            }

            let terminalReason: 'cancelled' | 'timed-out' | null = null;
            let settled = false;
            let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
            const timeout = setTimeout(() => {
                terminalReason = 'timed-out';
                terminate(child);
            }, request.timeoutMs);
            const abort = (): void => {
                terminalReason = 'cancelled';
                terminate(child);
            };
            const terminate = (process: StreamingChildProcess): void => {
                try {
                    process.kill('SIGTERM');
                } catch {
                    // The close or error event remains authoritative.
                }
                forceKillTimer ??= setTimeout(() => {
                    try {
                        process.kill('SIGKILL');
                    } catch {
                        // The process may already have exited.
                    }
                }, FORCE_KILL_DELAY_MS);
            };
            const settle = (result: ToolStreamingExecutionResult): void => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                if (forceKillTimer) {
                    clearTimeout(forceKillTimer);
                }
                request.signal.removeEventListener('abort', abort);
                resolve(result);
            };

            request.signal.addEventListener('abort', abort, { once: true });
            if (request.signal.aborted) {
                abort();
            }
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                request.onStdout?.(chunk);
            });
            child.stderr.on('data', (chunk: string) => {
                request.onStderr?.(chunk);
            });
            child.once('error', () => {
                settle({
                    success: false,
                    reason: terminalReason ?? 'command-failed',
                    exitCode: null,
                });
            });
            child.once('close', (code) => {
                if (terminalReason) {
                    settle({
                        success: false,
                        reason: terminalReason,
                        exitCode: code,
                    });
                    return;
                }
                settle(
                    code === 0
                        ? { success: true, exitCode: 0 }
                        : {
                              success: false,
                              reason: 'command-failed',
                              exitCode: code,
                          },
                );
            });
        });
    }
}
