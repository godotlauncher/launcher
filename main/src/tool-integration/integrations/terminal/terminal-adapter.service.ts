import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { TerminalLaunchResult } from '@shared/contracts';
import type { TerminalTarget } from './terminal.types.js';

const TERMINAL_APP = '/System/Applications/Utilities/Terminal.app';

/** Detects only the compiled native terminal catalogue and launches it. */
@Injectable()
export class TerminalAdapterService {
    /** Finds supported applications without executing discovery commands. */
    async discover(): Promise<TerminalTarget[]> {
        const candidates: TerminalTarget[] = [];
        if (process.platform === 'darwin') {
            candidates.push({
                id: 'macos-terminal',
                displayName: 'Terminal.app',
                executablePath: TERMINAL_APP,
            });
        } else if (process.platform === 'win32') {
            if (
                process.env.LOCALAPPDATA &&
                path.win32.isAbsolute(process.env.LOCALAPPDATA)
            ) {
                candidates.push({
                    id: 'windows-terminal',
                    displayName: 'Windows Terminal',
                    executablePath: path.win32.join(
                        process.env.LOCALAPPDATA,
                        'Microsoft',
                        'WindowsApps',
                        'wt.exe',
                    ),
                });
            }
            if (
                process.env.SystemRoot &&
                path.win32.isAbsolute(process.env.SystemRoot)
            ) {
                candidates.push({
                    id: 'command-prompt',
                    displayName: 'Command Prompt',
                    executablePath: path.win32.join(
                        process.env.SystemRoot,
                        'System32',
                        'cmd.exe',
                    ),
                });
            }
        } else if (process.platform === 'linux') {
            for (const [id, displayName, executable] of [
                ['gnome-terminal', 'GNOME Terminal', 'gnome-terminal'],
                ['konsole', 'Konsole', 'konsole'],
            ] as const) {
                // Fixed native system locations exclude project PATH entries and sandbox wrappers.
                for (const directory of ['/usr/bin', '/bin']) {
                    const candidate = {
                        id,
                        displayName,
                        executablePath: path.posix.join(directory, executable),
                    };
                    if (await this.isAvailable(candidate)) {
                        candidates.push(candidate);
                        break;
                    }
                }
            }
        }
        const availability = await Promise.all(
            candidates.map((candidate) => this.isAvailable(candidate)),
        );
        return candidates.filter((_, index) => availability[index]);
    }

    /**
     * Rechecks the fixed application before dispatch.
     * @param target - Compiled candidate returned by discovery.
     */
    async isAvailable(target: TerminalTarget): Promise<boolean> {
        try {
            const executable =
                target.id === 'macos-terminal'
                    ? path.posix.join(TERMINAL_APP, 'Contents/MacOS/Terminal')
                    : target.executablePath;
            await access(executable, constants.X_OK);
            return (await stat(executable)).isFile();
        } catch {
            return false;
        }
    }

    /**
     * Opens an exact directory without supplying any shell command.
     * @param target - Freshly resolved compiled terminal candidate.
     * @param directory - Validated absolute project directory.
     */
    async launch(
        target: TerminalTarget,
        directory: string,
    ): Promise<TerminalLaunchResult> {
        if (target.id === 'command-prompt' && /^\\\\/.test(directory)) {
            return { success: false, reason: 'unsupported-directory' };
        }
        if (!(await this.isAvailable(target)))
            return { success: false, reason: 'unavailable' };
        try {
            if (
                !path.isAbsolute(directory) ||
                !(await stat(directory)).isDirectory()
            )
                return { success: false, reason: 'missing-directory' };
            await access(directory, constants.R_OK | constants.X_OK);
        } catch {
            return { success: false, reason: 'missing-directory' };
        }
        const dispatcher =
            target.id === 'macos-terminal' ||
            target.id === 'windows-terminal' ||
            target.id === 'gnome-terminal';
        const executable =
            target.id === 'macos-terminal'
                ? '/usr/bin/open'
                : target.executablePath;
        const args =
            target.id === 'macos-terminal'
                ? ['-a', TERMINAL_APP, directory]
                : target.id === 'windows-terminal'
                  ? ['-d', '.']
                  : target.id === 'gnome-terminal'
                    ? ['--working-directory', directory]
                    : target.id === 'konsole'
                      ? ['--separate', '--workdir', '.']
                      : [];
        return new Promise((resolve) => {
            try {
                const child = spawn(executable, args, {
                    cwd: directory,
                    shell: false,
                    detached: !dispatcher,
                    stdio: 'ignore',
                    windowsHide: target.id !== 'command-prompt',
                });
                child.once('error', () =>
                    resolve({ success: false, reason: 'launch-failed' }),
                );
                if (dispatcher) {
                    child.once('exit', (code) =>
                        resolve(
                            code === 0
                                ? { success: true }
                                : { success: false, reason: 'launch-failed' },
                        ),
                    );
                } else {
                    child.once('spawn', () => {
                        child.unref();
                        resolve({ success: true });
                    });
                }
            } catch {
                resolve({ success: false, reason: 'launch-failed' });
            }
        });
    }
}
