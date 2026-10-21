import * as path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';

export const COMMAND_LINE_GODOT_MARKER = 'Godot Launcher managed godot command';

/**
 * Quotes one literal argument for a POSIX shell.
 * @param value - Literal argument, including any spaces or shell characters.
 */
export function quoteShellArgument(value: string): string {
    if (/[\0\r\n]/.test(value))
        throw new Error('Invalid command-line editor path.');
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Resolves the editor executable used directly by the terminal wrapper.
 * @param release - Authoritative registered installation.
 * @param platform - Platform whose executable layout is used.
 */
export function getCommandLineExecutable(
    release: InstalledRelease,
    platform: NodeJS.Platform,
): string {
    if (platform === 'win32') {
        if (release.console_path) return release.console_path;
        return release.source === 'custom'
            ? release.editor_path
            : release.editor_path.replace(/(_console)?\.exe$/i, '_console.exe');
    }
    if (platform === 'darwin' && release.editor_path.endsWith('.app')) {
        return path.posix.join(
            release.editor_path,
            'Contents',
            'MacOS',
            'Godot',
        );
    }
    return release.editor_path;
}

/**
 * Builds a wrapper that preserves the caller's directory, arguments and status.
 * @param executable - Absolute target executable.
 * @param platform - Platform whose script syntax is required.
 */
export function createGodotWrapper(
    executable: string,
    platform: NodeJS.Platform,
): string {
    if (platform === 'win32') {
        if (/["\0\r\n]/.test(executable))
            throw new Error('Invalid command-line editor path.');
        const target = executable.replaceAll('%', '%%');
        return [
            '@echo off',
            `rem ${COMMAND_LINE_GODOT_MARKER}`,
            'setlocal DisableDelayedExpansion',
            'set "GODOT_LAUNCHER_CODEPAGE="',
            'for /f "tokens=2 delims=:" %%C in (\'chcp\') do set "GODOT_LAUNCHER_CODEPAGE=%%C"',
            'chcp 65001 >nul',
            'if errorlevel 1 exit /b 1',
            `if not exist "${target}" (`,
            '  >&2 echo The selected Godot editor is unavailable. Choose a default command-line editor in Godot Launcher.',
            '  set "GODOT_LAUNCHER_EXIT=127"',
            '  goto godot_launcher_exit',
            ')',
            `"${target}" %*`,
            'set "GODOT_LAUNCHER_EXIT=%errorlevel%"',
            ':godot_launcher_exit',
            'if defined GODOT_LAUNCHER_CODEPAGE chcp %GODOT_LAUNCHER_CODEPAGE% >nul',
            'exit /b %GODOT_LAUNCHER_EXIT%',
            '',
        ].join('\r\n');
    }
    const target = quoteShellArgument(executable);
    return [
        '#!/bin/sh',
        `# ${COMMAND_LINE_GODOT_MARKER}`,
        `if [ ! -x ${target} ]; then`,
        "  printf '%s\\n' 'The selected Godot editor is unavailable. Choose a default command-line editor in Godot Launcher.' >&2",
        '  exit 127',
        'fi',
        `exec ${target} "$@"`,
        '',
    ].join('\n');
}

/**
 * Creates an idempotent, append-only shell PATH block.
 * @param binDirectory - Managed bin directory to append.
 */
export function createGodotPathBlock(binDirectory: string): string {
    const literal = quoteShellArgument(binDirectory);
    return [
        '# >>> Godot Launcher PATH >>>',
        `case ":\${PATH}:" in`,
        `  *:${literal}:*) ;;`,
        `  *) export PATH="\${PATH:+\${PATH}:}"${literal} ;;`,
        'esac',
        '# <<< Godot Launcher PATH <<<',
        '',
    ].join('\n');
}
