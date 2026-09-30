import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

/**
 * Quotes one value for a POSIX shell command.
 * @param value - Path to quote.
 */
function quoteShellArgument(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Resolves the executable named by a macOS app bundle.
 * @param bundlePath - Godot app bundle path.
 */
async function resolveBundleExecutable(bundlePath: string): Promise<string> {
    const infoPath = path.join(bundlePath, 'Contents', 'Info.plist');
    const stdout = await new Promise<string>((resolve, reject) =>
        execFile(
            '/usr/bin/plutil',
            ['-convert', 'json', '-o', '-', infoPath],
            { encoding: 'utf8', timeout: 5000 },
            (error, output) => (error ? reject(error) : resolve(output)),
        ),
    );
    const info: unknown = JSON.parse(stdout);
    const name =
        info && typeof info === 'object' && 'CFBundleExecutable' in info
            ? info.CFBundleExecutable
            : null;
    if (
        typeof name !== 'string' ||
        !name.trim() ||
        name !== name.trim() ||
        name === '.' ||
        name === '..' ||
        name.includes('/') ||
        name.includes('\\')
    ) {
        throw new Error('Godot app bundle has no valid executable name');
    }

    const executable = path.join(bundlePath, 'Contents', 'MacOS', name);
    await access(executable, constants.X_OK);
    return executable;
}

/**
 * Creates a private, single-use Terminal script for one project launch.
 * @param bundlePath - Godot app bundle path.
 * @param projectPath - Project directory to open in Godot.
 * @param windowed - Whether to request windowed mode.
 */
export async function createMacOSTerminalLaunchScript(
    bundlePath: string,
    projectPath: string,
    windowed: boolean,
): Promise<string> {
    const executable = await resolveBundleExecutable(bundlePath);
    const directory = await mkdtemp(
        path.join(app.getPath('temp'), 'godot-launch-'),
    );
    const scriptPath = path.join(directory, 'launch.command');
    const arguments_ = [
        quoteShellArgument(executable),
        '--path',
        quoteShellArgument(projectPath),
        '-e',
    ];
    if (windowed) arguments_.push('-w');

    const script = [
        '#!/bin/sh',
        'trap \'rm -f "$0"; rmdir "$(dirname "$0")"\' EXIT',
        arguments_.join(' '),
        'status=$?',
        'printf "\\nGodot exited (code %s). Press Return to finish..." "$status"',
        'IFS= read -r _answer || true',
        'printf "\\n"',
        'exit "$status"',
        '',
    ].join('\n');

    try {
        await writeFile(scriptPath, script, {
            encoding: 'utf8',
            mode: 0o700,
            flag: 'wx',
        });
        return scriptPath;
    } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}

/**
 * Removes a launch script when Terminal could not open it.
 * @param scriptPath - Path returned by createMacOSTerminalLaunchScript.
 */
export async function removeMacOSTerminalLaunchScript(
    scriptPath: string,
): Promise<void> {
    await rm(path.dirname(scriptPath), { recursive: true, force: true });
}
