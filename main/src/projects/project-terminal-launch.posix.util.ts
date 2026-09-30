import { constants } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { terminalScriptStartPath } from '../tool-integration/integrations/terminal/terminal-script-start.util.js';

/**
 * Quotes one value for a POSIX shell command.
 * @param value - Path to quote.
 */
function quoteShellArgument(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Creates a private shell script that retains Godot output until acknowledged.
 * @param executable - Godot executable path.
 * @param projectPath - Project directory to open in Godot.
 * @param windowed - Whether to request windowed mode.
 * @param extension - Script suffix required by the native terminal.
 */
export async function createPosixTerminalLaunchScript(
    executable: string,
    projectPath: string,
    windowed: boolean,
    extension: 'command' | 'sh',
): Promise<string> {
    await access(executable, constants.X_OK);
    const directory = await mkdtemp(
        path.join(app.getPath('temp'), 'godot-launch-'),
    );
    const scriptPath = path.join(directory, `launch.${extension}`);
    const arguments_ = [
        quoteShellArgument(executable),
        '--path',
        quoteShellArgument(projectPath),
        '-e',
    ];
    if (windowed) arguments_.push('-w');

    const script = [
        '#!/bin/sh',
        ...(extension === 'sh'
            ? [
                  `_launch_started=${quoteShellArgument(terminalScriptStartPath(scriptPath))}`,
                  'trap \'rm -f "$0" "$_launch_started"; rmdir "$(dirname "$0")"\' EXIT',
                  ': > "$_launch_started" || exit 1',
              ]
            : ['trap \'rm -f "$0"; rmdir "$(dirname "$0")"\' EXIT']),
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
 * Removes a launch script when its terminal could not open it.
 * @param scriptPath - Path returned by createPosixTerminalLaunchScript.
 */
export async function removePosixTerminalLaunchScript(
    scriptPath: string,
): Promise<void> {
    await rm(path.dirname(scriptPath), { recursive: true, force: true });
}
