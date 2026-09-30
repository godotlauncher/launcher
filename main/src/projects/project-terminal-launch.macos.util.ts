import { execFile } from 'node:child_process';
import path from 'node:path';
import { createPosixTerminalLaunchScript } from './project-terminal-launch.posix.util.js';

/**
 * Waits for macOS to accept a script launch in Terminal.
 * @param scriptPath - Private launch script to open.
 */
export async function openMacOSTerminalLaunchScript(
    scriptPath: string,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        execFile(
            '/usr/bin/open',
            ['-a', '/System/Applications/Utilities/Terminal.app', scriptPath],
            { timeout: 5000 },
            (error) => (error ? reject(error) : resolve()),
        );
    });
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
    return createPosixTerminalLaunchScript(
        executable,
        projectPath,
        windowed,
        'command',
    );
}
