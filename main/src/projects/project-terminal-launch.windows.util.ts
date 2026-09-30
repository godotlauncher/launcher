import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

/**
 * Checks that a Windows executable is a readable file, following project links.
 * @param executable - Executable to check.
 */
async function isReadableFile(executable: string): Promise<boolean> {
    try {
        await access(executable, constants.R_OK);
        return (await stat(executable)).isFile();
    } catch {
        return false;
    }
}

/**
 * Launches Godot in a new console with a private batch helper that waits for Return.
 * @param launchPath - Project-local Godot executable, preserving editor settings.
 * @param projectPath - Project directory to open in Godot.
 * @param windowed - Whether to request windowed mode.
 * @param consolePath - Optional registered console executable whose project-local copy is preferred.
 */
export async function launchWindowsTerminal(
    launchPath: string,
    projectPath: string,
    windowed: boolean,
    consolePath?: string,
): Promise<void> {
    const systemDirectory = process.env.SystemRoot;
    if (!systemDirectory || !path.win32.isAbsolute(systemDirectory))
        throw new Error('Windows system directory is unavailable');
    const commandPrompt = path.win32.join(
        systemDirectory,
        'System32',
        'cmd.exe',
    );
    if (!(await isReadableFile(commandPrompt)))
        throw new Error('Windows Command Prompt is unavailable');
    if (
        !path.win32.isAbsolute(launchPath) ||
        !path.win32.isAbsolute(projectPath)
    )
        throw new Error('Windows editor and project paths must be absolute');

    const wrapperPath = consolePath
        ? path.win32.join(
              path.win32.dirname(launchPath),
              path.win32.basename(consolePath),
          )
        : launchPath.replace(/(?<!_console)\.exe$/i, '_console.exe');
    const executable = (await isReadableFile(wrapperPath))
        ? wrapperPath
        : launchPath;
    if (!(await isReadableFile(executable)))
        throw new Error('Windows Godot executable is unavailable');

    const directory = await mkdtemp(
        path.join(app.getPath('temp'), 'godot-launch-'),
    );
    const scriptPath = path.join(directory, 'launch.bat');
    const script = [
        '@echo off',
        'setlocal EnableExtensions DisableDelayedExpansion',
        'set "ERRORLEVEL="',
        'pushd "%GODOT_LAUNCH_PROJECT%"',
        'if errorlevel 1 goto directory_failed',
        `"%GODOT_LAUNCH_EXECUTABLE%" --path "%GODOT_LAUNCH_PROJECT_ARGUMENT%" -e${windowed ? ' -w' : ''}`,
        'set "GODOT_LAUNCH_EXIT_CODE=%ERRORLEVEL%"',
        'popd',
        'goto finished',
        ':directory_failed',
        'set "GODOT_LAUNCH_EXIT_CODE=1"',
        ':finished',
        'echo.',
        'echo Godot exited (code %GODOT_LAUNCH_EXIT_CODE%). Press Return to finish...',
        'set /p "GODOT_LAUNCH_ACK="',
        'cd /d "%SystemRoot%"',
        // CMD parses this line before deleting the batch file and its directory.
        'endlocal & del "%~f0" & rmdir "%~dp0" & exit /b %GODOT_LAUNCH_EXIT_CODE%',
        '',
    ].join('\r\n');
    const environment = { ...process.env };
    const launchValues = {
        GODOT_LAUNCH_COMMAND_PROMPT: commandPrompt,
        GODOT_LAUNCH_EXECUTABLE: executable,
        GODOT_LAUNCH_PROJECT: projectPath,
        GODOT_LAUNCH_PROJECT_ARGUMENT: projectPath.replace(/\\+$/, '$&$&'),
    };
    for (const key of Object.keys(environment)) {
        if (Object.hasOwn(launchValues, key.toUpperCase()))
            delete environment[key];
    }
    Object.assign(environment, launchValues);

    try {
        // ASCII batch text and Unicode environment values avoid code-page-dependent paths.
        await writeFile(scriptPath, script, {
            encoding: 'ascii',
            mode: 0o700,
            flag: 'wx',
        });
        await new Promise<void>((resolve, reject) => {
            const dispatcher = spawn(
                commandPrompt,
                [
                    '/d',
                    '/e:on',
                    '/v:off',
                    '/c',
                    'start "" "%GODOT_LAUNCH_COMMAND_PROMPT%" /d /e:on /v:off /c launch.bat',
                ],
                {
                    cwd: directory,
                    env: environment,
                    shell: false,
                    stdio: 'ignore',
                    windowsHide: true,
                    windowsVerbatimArguments: true,
                },
            );
            dispatcher.once('error', reject);
            dispatcher.once('exit', (code) => {
                if (code === 0) resolve();
                else
                    reject(
                        new Error(
                            `Windows console dispatch failed (code ${code})`,
                        ),
                    );
            });
        });
    } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}
