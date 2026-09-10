import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { TerminalLaunchResult } from '@shared/contracts';
import logger from 'electron-log';
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
                ['foot', 'Foot', 'foot'],
                ['alacritty', 'Alacritty', 'alacritty'],
                ['ghostty', 'Ghostty', 'ghostty'],
                ['kitty', 'Kitty', 'kitty'],
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
        const detected = candidates.filter((_, index) => availability[index]);
        if (process.platform === 'linux')
            logger.info('[Terminal] Detected Linux terminals', detected);
        return detected;
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
            if (target.id === 'windows-terminal') {
                // Windows app execution aliases cannot reliably be followed by stat.
                const alias = await lstat(executable);
                return alias.isFile() || alias.isSymbolicLink();
            }
            return (await stat(executable)).isFile();
        } catch {
            return false;
        }
    }

    /**
     * Opens an exact directory and records bounded Linux launch diagnostics.
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
        const logLinux = process.platform === 'linux';
        if (logLinux)
            logger.info('[Terminal] Linux launch requested', {
                target: target.id,
                executable: target.executablePath,
                desktop: process.env.XDG_CURRENT_DESKTOP,
                sessionType: process.env.XDG_SESSION_TYPE,
                hasWaylandDisplay: Boolean(process.env.WAYLAND_DISPLAY),
                hasXDisplay: Boolean(process.env.DISPLAY),
                hasRuntimeDirectory: Boolean(process.env.XDG_RUNTIME_DIR),
                hasSessionBus: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
                appImage: Boolean(process.env.APPIMAGE),
            });
        if (!(await this.isAvailable(target))) {
            if (logLinux)
                logger.warn('[Terminal] Launch target unavailable', target.id);
            return { success: false, reason: 'unavailable' };
        }
        try {
            if (
                !path.isAbsolute(directory) ||
                !(await stat(directory)).isDirectory()
            ) {
                if (logLinux)
                    logger.warn(
                        '[Terminal] Project directory missing or invalid',
                        target.id,
                    );
                return { success: false, reason: 'missing-directory' };
            }
            await access(directory, constants.R_OK | constants.X_OK);
        } catch (error) {
            if (logLinux)
                logger.warn(
                    '[Terminal] Project directory access failed',
                    target.id,
                    error,
                );
            return { success: false, reason: 'missing-directory' };
        }
        const dispatcher =
            target.id === 'macos-terminal' ||
            target.id === 'windows-terminal' ||
            target.id === 'command-prompt' ||
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
                      : target.id === 'ghostty'
                        ? [
                              '--gtk-single-instance=false',
                              `--working-directory=${directory}`,
                          ]
                        : target.id === 'kitty'
                          ? ['--directory', directory]
                          : target.id === 'foot' || target.id === 'alacritty'
                            ? ['--working-directory', directory]
                            : [];
        if (target.id === 'command-prompt') {
            // START gives CMD its own interactive console; the project stays in cwd.
            args.push('/d', '/c', `start "" "${executable}" /d`);
        }
        const startedAt = Date.now();
        if (logLinux)
            logger.info('[Terminal] Spawning Linux terminal', {
                target: target.id,
                executable,
                args: args.map((arg) =>
                    arg.replaceAll(directory, '<project-directory>'),
                ),
                dispatcher,
            });
        return new Promise((resolve) => {
            try {
                const child = spawn(executable, args, {
                    cwd: directory,
                    shell: false,
                    detached: !dispatcher,
                    stdio: logLinux ? ['ignore', 'ignore', 'pipe'] : 'ignore',
                    windowsHide: target.id !== 'windows-terminal',
                    ...(target.id === 'command-prompt'
                        ? { windowsVerbatimArguments: true }
                        : {}),
                });
                if (logLinux) {
                    let remainingBytes = 16 * 1024;
                    child.stderr?.on('data', (chunk: Buffer) => {
                        if (remainingBytes <= 0) return;
                        const output = chunk.subarray(0, remainingBytes);
                        remainingBytes -= output.length;
                        logger.warn('[Terminal] Linux stderr', {
                            target: target.id,
                            pid: child.pid,
                            output: output.toString('utf8'),
                        });
                        if (remainingBytes === 0)
                            logger.warn(
                                '[Terminal] Stderr capture limit reached',
                                child.pid,
                            );
                    });
                    child.stderr?.on('error', (error) =>
                        logger.warn(
                            '[Terminal] Stderr stream failed',
                            target.id,
                            error,
                        ),
                    );
                    // Keep draining stderr without keeping the launcher alive.
                    if (
                        child.stderr &&
                        'unref' in child.stderr &&
                        typeof child.stderr.unref === 'function'
                    )
                        child.stderr.unref();
                    child.once('spawn', () =>
                        logger.info('[Terminal] Linux process spawned', {
                            target: target.id,
                            pid: child.pid,
                        }),
                    );
                    child.once('exit', (code, signal) =>
                        logger.info('[Terminal] Linux process exited', {
                            target: target.id,
                            pid: child.pid,
                            code,
                            signal,
                            elapsedMs: Date.now() - startedAt,
                        }),
                    );
                }
                child.once('error', (error) => {
                    if (logLinux)
                        logger.warn(
                            '[Terminal] Linux spawn failed',
                            target.id,
                            error,
                        );
                    resolve({ success: false, reason: 'launch-failed' });
                });
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
            } catch (error) {
                if (logLinux)
                    logger.warn(
                        '[Terminal] Linux spawn threw',
                        target.id,
                        error,
                    );
                resolve({ success: false, reason: 'launch-failed' });
            }
        });
    }
}
