import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CommandLineGodotResult } from '@shared/contracts';
import {
    createGodotPathBlock,
    quoteShellArgument,
} from './command-line-godot.util.js';

const PATH_BLOCK_START = '# >>> Godot Launcher PATH >>>';
const PATH_CHANGED_MARKER = 'GODOT_LAUNCHER_PATH_CHANGED';

type PathRegistrationResult = Pick<
    CommandLineGodotResult,
    'conflict' | 'pathChanged'
>;

/** Paths and environment used by one user's command registration. */
export type CommandLinePathOptions = {
    platform: NodeJS.Platform;
    home: string;
    env: NodeJS.ProcessEnv;
    shell: string;
    fixture?: boolean;
};

/** Adds one per-user bin directory without replacing existing command priority. */
export class CommandLinePathAdapter {
    readonly binDirectory: string;
    readonly wrapperPath: string;

    /**
     * Resolves stable paths independently of editor versions and app updates.
     * @param options - Platform and isolated user environment.
     */
    constructor(private readonly options: CommandLinePathOptions) {
        const { platform, home, env } = options;
        const paths = platform === 'win32' ? path.win32 : path.posix;
        const root =
            platform === 'win32'
                ? paths.join(
                      env.LOCALAPPDATA || paths.join(home, 'AppData', 'Local'),
                      'GodotLauncher',
                  )
                : platform === 'darwin'
                  ? paths.join(
                        home,
                        'Library',
                        'Application Support',
                        'GodotLauncher',
                    )
                  : paths.join(home, '.local', 'share', 'godot-launcher');
        this.binDirectory = paths.join(root, 'bin');
        this.wrapperPath = paths.join(
            this.binDirectory,
            platform === 'win32' ? 'godot.cmd' : 'godot',
        );
    }

    /**
     * Reports PATH setup changes and existing command precedence.
     * @param command - Portable command name, defaulting to godot.
     */
    async register(command = 'godot'): Promise<PathRegistrationResult> {
        this.validateCommand(command);
        if (this.options.platform === 'win32')
            return this.registerWindows(command);
        const shell = path.basename(this.options.shell);
        const conflict = await this.findShellConflict(shell, command);
        let pathChanged = false;
        if (shell === 'zsh') {
            const directory = await this.resolveZshDirectory();
            pathChanged = await this.appendBlock(
                path.join(directory, '.zshrc'),
            );
        } else if (shell === 'bash' || shell === 'sh') {
            if (shell === 'bash')
                pathChanged = await this.appendBlock(
                    path.join(this.options.home, '.bashrc'),
                );
            const profiles =
                shell === 'bash'
                    ? ['.bash_profile', '.bash_login', '.profile']
                    : ['.profile'];
            let profile = '.profile';
            for (const candidate of profiles) {
                try {
                    await fs.access(path.join(this.options.home, candidate));
                    profile = candidate;
                    break;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                        throw error;
                }
            }
            pathChanged =
                (await this.appendBlock(
                    path.join(this.options.home, profile),
                )) || pathChanged;
        } else if (shell === 'fish') {
            const config =
                this.options.env.XDG_CONFIG_HOME ||
                path.join(this.options.home, '.config');
            const file = path.join(
                config,
                'fish',
                'conf.d',
                'godot-launcher.fish',
            );
            const block = `${PATH_BLOCK_START}\nfish_add_path --global --path --append ${quoteShellArgument(this.binDirectory)}\n# <<< Godot Launcher PATH <<<\n`;
            await fs.mkdir(path.dirname(file), { recursive: true });
            const current = await this.readOptional(file);
            if (current && current !== block)
                throw new Error(
                    'The Godot Launcher fish PATH file has been changed. Restore it before selecting a command-line default.',
                );
            if (!current) {
                await fs.writeFile(file, block, { flag: 'wx', mode: 0o600 });
                pathChanged = true;
            }
        } else {
            const entries = (this.options.env.PATH || '').split(':');
            if (!entries.includes(this.binDirectory)) {
                throw new Error(
                    `Add ${this.binDirectory} to your shell's PATH manually and restart Godot Launcher; automatic setup supports Bash, Zsh and Fish.`,
                );
            }
        }
        return { conflict, pathChanged };
    }

    /**
     * Resolves a validated command in the shared per-user bin directory.
     * @param command - Literal portable command name.
     */
    pathForCommand(command: string): string {
        this.validateCommand(command);
        const paths =
            this.options.platform === 'win32' ? path.win32 : path.posix;
        return paths.join(
            this.binDirectory,
            this.options.platform === 'win32' ? `${command}.cmd` : command,
        );
    }

    /**
     * Checks command resolution without changing PATH or executing the editor.
     * @param command - Literal portable command name.
     */
    async findConflict(command: string): Promise<string | null> {
        this.validateCommand(command);
        if (this.options.platform !== 'win32')
            return this.findShellConflict(
                path.basename(this.options.shell),
                command,
            );
        const script = `$ErrorActionPreference = 'Stop'; $paths = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); foreach ($entry in ([Environment]::ExpandEnvironmentVariables($paths) -split ';')) { if ([string]::IsNullOrWhiteSpace($entry)) { continue }; foreach ($ext in @('.com','.exe','.bat','.cmd')) { $candidate = Join-Path $entry ('${command}' + $ext); if (Test-Path -LiteralPath $candidate -PathType Leaf) { Write-Output $candidate; return } } }`;
        const executable = path.win32.join(
            this.options.env.SystemRoot || 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
        );
        const { stdout } = await this.execute(
            executable,
            [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-EncodedCommand',
                Buffer.from(script, 'utf16le').toString('base64'),
            ],
            {
                env: this.options.env,
                timeout: 10000,
                windowsHide: true,
                maxBuffer: 64 * 1024,
            },
        );
        const resolved = stdout.trim();
        return resolved &&
            resolved.toLowerCase() !==
                this.pathForCommand(command).toLowerCase()
            ? resolved
            : null;
    }

    /**
     * Checks a request's commands with one process per shell startup mode.
     * @param commands - Literal portable command names, validated before lookup.
     */
    async findConflicts(
        commands: string[],
    ): Promise<Map<string, string | null>> {
        for (const command of commands) this.validateCommand(command);
        const pending = [...new Set(commands)];
        const conflicts = new Map<string, string | null>();
        if (!pending.length) return conflicts;
        const shell = path.basename(this.options.shell);
        if (
            this.options.platform !== 'win32' &&
            !['bash', 'zsh', 'sh', 'fish'].includes(shell)
        ) {
            for (const command of pending)
                conflicts.set(command, await this.findConflict(command));
            return conflicts;
        }
        try {
            for (const mode of this.options.platform === 'win32'
                ? ['windows']
                : ['-ic', '-lic']) {
                const names = pending.filter(
                    (command) => !conflicts.get(command),
                );
                if (!names.length) break;
                const marker = `GODOT_LOOKUP_${randomUUID().replaceAll('-', '')}`;
                let executable = this.options.shell;
                let args: string[];
                if (mode === 'windows') {
                    executable = path.win32.join(
                        this.options.env.SystemRoot || 'C:\\Windows',
                        'System32',
                        'WindowsPowerShell',
                        'v1.0',
                        'powershell.exe',
                    );
                    const script = `$ErrorActionPreference = 'Stop'; $paths = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); foreach ($name in @(${names.map((name) => `'${name}'`).join(',')})) { $resolved = ''; foreach ($entry in ([Environment]::ExpandEnvironmentVariables($paths) -split ';')) { if ([string]::IsNullOrWhiteSpace($entry)) { continue }; foreach ($ext in @('.com','.exe','.bat','.cmd')) { $candidate = Join-Path $entry ($name + $ext); if (Test-Path -LiteralPath $candidate -PathType Leaf) { $resolved = $candidate; break } }; if ($resolved) { break } }; [Console]::Write('${marker}' + [char]0 + $name + [char]0 + $resolved + [char]0 + '0' + [char]0 + '${marker}' + [char]0) }`;
                    args = [
                        '-NoLogo',
                        '-NoProfile',
                        '-NonInteractive',
                        '-EncodedCommand',
                        Buffer.from(script, 'utf16le').toString('base64'),
                    ];
                } else {
                    const printf =
                        shell === 'sh' ? 'command printf' : 'builtin printf';
                    const script = names
                        .map((command) => {
                            const lookup =
                                shell === 'fish'
                                    ? `if type -t ${command} | string match -q function; builtin printf '%s\\n' '${command} (Fish function or alias)'; else; command -s ${command}; end`
                                    : `command -v ${command}`;
                            return `${printf} '${marker}\\0${command}\\0'; ${lookup}; ${printf} '\\0%s\\0${marker}\\0' "${shell === 'fish' ? '$status' : '$?'}"`;
                        })
                        .join('; ');
                    args = [mode, script];
                }
                const { stdout } = await this.execute(executable, args, {
                    env: this.options.env,
                    timeout: mode === 'windows' ? 10000 : 5000,
                    windowsHide: mode === 'windows',
                    maxBuffer: 64 * 1024,
                });
                const results = this.parseLookupBatch(
                    stdout,
                    marker,
                    names,
                    shell,
                );
                for (const [command, resolved] of results) {
                    const managed = this.pathForCommand(command);
                    conflicts.set(
                        command,
                        resolved &&
                            (mode === 'windows'
                                ? resolved.toLowerCase() !==
                                  managed.toLowerCase()
                                : resolved !== managed)
                            ? resolved
                            : null,
                    );
                }
            }
            return conflicts;
        } catch (error) {
            throw new Error(
                'Could not check the terminal PATH. Check your shell configuration and try again.',
                { cause: error },
            );
        }
    }

    /**
     * Requires one complete, successful lookup record for every requested name.
     * @param stdout - Process output, possibly including startup messages.
     * @param marker - Unpredictable delimiter for this process.
     * @param commands - Names expected in their original lookup order.
     * @param shell - Shell filename determining missing-command statuses.
     */
    private parseLookupBatch(
        stdout: string,
        marker: string,
        commands: string[],
        shell: string,
    ): Map<string, string | null> {
        const results = new Map<string, string | null>();
        const delimiter = `${marker}\0`;
        let offset = stdout.indexOf(delimiter);
        if (offset < 0) throw new Error('Missing command lookup results.');
        for (const command of commands) {
            if (!stdout.startsWith(`${delimiter}${command}\0`, offset))
                throw new Error('Invalid command lookup result.');
            const start = offset + delimiter.length + command.length + 1;
            const end = stdout.indexOf('\0', start);
            const statusEnd = stdout.indexOf('\0', end + 1);
            if (
                end < 0 ||
                statusEnd < 0 ||
                !stdout.startsWith(delimiter, statusEnd + 1)
            )
                throw new Error('Incomplete command lookup result.');
            const status = stdout.slice(end + 1, statusEnd);
            if (
                !['0', '1', ...(shell === 'fish' ? ['127'] : [])].includes(
                    status,
                )
            )
                throw new Error('Command lookup failed.');
            const resolved = stdout.slice(start, end).trim();
            if (status !== '0' && resolved)
                throw new Error('Invalid missing-command lookup result.');
            results.set(command, status === '0' && resolved ? resolved : null);
            offset = statusEnd + 1 + delimiter.length;
        }
        if (stdout.slice(offset).includes(delimiter))
            throw new Error('Unexpected command lookup results.');
        return results;
    }

    /**
     * Rejects names before they enter platform lookup scripts or filenames.
     * @param command - Untrusted requested command name.
     */
    private validateCommand(command: string): void {
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(command))
            throw new Error('Invalid command name.');
    }

    /** Resolves Zsh's startup directory after it reads the user's .zshenv. */
    private async resolveZshDirectory(): Promise<string> {
        const prefix = 'GODOT_LAUNCHER_ZDOTDIR=';
        const { stdout } = await this.execute(
            this.options.shell,
            ['-c', `printf '\\n${prefix}%s\\n' "\${ZDOTDIR:-$HOME}"`],
            {
                env: this.options.env,
                timeout: 5000,
                maxBuffer: 64 * 1024,
            },
        );
        const directory = stdout
            .split('\n')
            .findLast((line) => line.startsWith(prefix))
            ?.slice(prefix.length);
        if (!directory || !path.isAbsolute(directory))
            throw new Error(
                'Could not resolve the Zsh configuration directory.',
            );
        return directory;
    }

    /**
     * Reports whether a managed block was added, preserving unrelated configuration.
     * @param file - User-owned startup file selected for this shell.
     */
    private async appendBlock(file: string): Promise<boolean> {
        const current = await this.readOptional(file);
        if (current.includes(PATH_BLOCK_START)) {
            if (
                !current.includes(
                    createGodotPathBlock(this.binDirectory).trimEnd(),
                )
            ) {
                throw new Error(
                    'The Godot Launcher PATH block has been changed. Restore it before selecting a command-line default.',
                );
            }
            return false;
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.appendFile(
            file,
            `${current.endsWith('\n') || !current ? '' : '\n'}\n${createGodotPathBlock(this.binDirectory)}`,
            { mode: 0o600 },
        );
        return true;
    }

    /**
     * Reads optional configuration, surfacing permission and filesystem failures.
     * @param file - User configuration file.
     */
    private async readOptional(file: string): Promise<string> {
        try {
            return await fs.readFile(file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
            throw error;
        }
    }

    /**
     * Checks the user's interactive shell without executing any Godot command.
     * @param shell - Shell filename used to select lookup syntax.
     * @param requestedCommand - Portable name being checked.
     */
    private async findShellConflict(
        shell: string,
        requestedCommand = 'godot',
    ): Promise<string | null> {
        const command = requestedCommand;
        if (!['bash', 'zsh', 'sh', 'fish'].includes(shell)) {
            for (const directory of (this.options.env.PATH || '').split(
                path.delimiter,
            )) {
                const candidate = path.resolve(directory || '.', command);
                try {
                    await fs.access(candidate, fs.constants.X_OK);
                    if (candidate !== this.pathForCommand(command))
                        return candidate;
                    return null;
                } catch (error) {
                    if (
                        !['ENOENT', 'EACCES'].includes(
                            (error as NodeJS.ErrnoException).code || '',
                        )
                    )
                        throw error;
                }
            }
            return null;
        }
        for (const mode of ['-ic', '-lic']) {
            try {
                const result = await this.execute(
                    this.options.shell,
                    [
                        mode,
                        shell === 'fish'
                            ? `if type -t ${command} | string match -q function; printf '%s\\n' '${command} (Fish function or alias)'; else; command -s ${command}; end`
                            : `command -v ${command}`,
                    ],
                    {
                        env: this.options.env,
                        timeout: 5000,
                        maxBuffer: 64 * 1024,
                    },
                );
                const resolved = result.stdout
                    .trim()
                    .split('\n')
                    .at(-1)
                    ?.trim();
                if (
                    resolved &&
                    resolved !== this.pathForCommand(requestedCommand)
                )
                    return resolved;
            } catch (error) {
                // Fish uses 127 for an absent external command; other shells use 1.
                const code = (error as { code?: number }).code;
                if (code === 1 || (shell === 'fish' && code === 127)) continue;
                throw new Error(
                    'Could not check the terminal PATH. Check your shell configuration and try again.',
                    { cause: error },
                );
            }
        }
        return null;
    }

    /**
     * Runs a platform utility with literal arguments and bounded output.
     * @param executable - Absolute shell or system utility path.
     * @param args - Literal process arguments.
     * @param options - Environment, timeout and output bounds.
     */
    private execute(
        executable: string,
        args: string[],
        options: {
            env: NodeJS.ProcessEnv;
            timeout: number;
            maxBuffer: number;
            windowsHide?: boolean;
        },
    ): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            execFile(
                executable,
                args,
                { ...options, encoding: 'utf8' },
                (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolve({ stdout, stderr });
                },
            );
        });
    }

    /**
     * Preserves the raw registry PATH and broadcasts changes without elevation.
     * @param command - Portable name to check for precedence.
     */
    private async registerWindows(
        command = 'godot',
    ): Promise<PathRegistrationResult> {
        if (this.options.fixture) {
            const file = path.join(this.binDirectory, '.fixture-user-path');
            const pathChanged =
                (await this.readOptional(file)) !== this.binDirectory;
            if (pathChanged) await fs.writeFile(file, this.binDirectory);
            return { conflict: null, pathChanged };
        }
        const directory = Buffer.from(this.binDirectory, 'utf8').toString(
            'base64',
        );
        const script = `
$ErrorActionPreference = 'Stop'
$bin = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${directory}'))
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $raw = $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
  if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) { throw 'The user PATH has an unsupported registry type.' }
  $entries = @($raw -split ';' | ForEach-Object { [Environment]::ExpandEnvironmentVariables($_).TrimEnd('\\') })
  if ($entries -notcontains $bin.TrimEnd('\\')) {
    $updated = if ([string]::IsNullOrEmpty($raw)) { $bin } else { $raw + $(if ($raw.EndsWith(';')) { '' } else { ';' }) + $bin }
    $key.SetValue('Path', $updated, $kind)
    Write-Output '${PATH_CHANGED_MARKER}'
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class GodotPathChange { [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result); }'
    $result = [UIntPtr]::Zero
    [void][GodotPathChange]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
  }
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $effective = [Environment]::ExpandEnvironmentVariables($machine + ';' + $raw)
  foreach ($entry in ($effective -split ';')) {
    if ([string]::IsNullOrWhiteSpace($entry)) { continue }
    foreach ($extension in @('.com', '.exe', '.bat', '.cmd')) {
      $candidate = Join-Path $entry ('${command}' + $extension)
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        if ($candidate -ine (Join-Path $bin '${command}.cmd')) { Write-Output $candidate }
        return
      }
    }
  }
} finally { $key.Dispose() }
`;
        const systemRoot = this.options.env.SystemRoot || 'C:\\Windows';
        const executable = path.win32.join(
            systemRoot,
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
        );
        const { stdout } = await this.execute(
            executable,
            [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-EncodedCommand',
                Buffer.from(script, 'utf16le').toString('base64'),
            ],
            {
                env: this.options.env,
                timeout: 20000,
                windowsHide: true,
                maxBuffer: 64 * 1024,
            },
        );
        const lines = stdout.trim().split(/\r?\n/);
        const pathChanged = lines[0] === PATH_CHANGED_MARKER;
        return {
            pathChanged,
            conflict:
                (pathChanged ? lines.slice(1) : lines).join('\n').trim() ||
                null,
        };
    }
}
