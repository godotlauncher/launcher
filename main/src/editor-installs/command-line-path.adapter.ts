import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    createGodotPathBlock,
    quoteShellArgument,
} from './command-line-godot.util.js';

const PATH_BLOCK_START = '# >>> Godot Launcher PATH >>>';

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

    /** Adds the managed directory for future terminals and reports an existing command. */
    async register(): Promise<string | null> {
        if (this.options.platform === 'win32') return this.registerWindows();
        const shell = path.basename(this.options.shell);
        const conflict = await this.findShellConflict(shell);
        if (shell === 'zsh') {
            const directory = await this.resolveZshDirectory();
            await this.appendBlock(path.join(directory, '.zshrc'));
        } else if (shell === 'bash' || shell === 'sh') {
            if (shell === 'bash')
                await this.appendBlock(path.join(this.options.home, '.bashrc'));
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
            await this.appendBlock(path.join(this.options.home, profile));
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
            if (!current)
                await fs.writeFile(file, block, { flag: 'wx', mode: 0o600 });
        } else {
            const entries = (this.options.env.PATH || '').split(':');
            if (!entries.includes(this.binDirectory)) {
                throw new Error(
                    `Add ${this.binDirectory} to your shell's PATH manually and restart Godot Launcher; automatic setup supports Bash, Zsh and Fish.`,
                );
            }
        }
        return conflict;
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
     * Adds an identifiable block without modifying unrelated shell configuration.
     * @param file - User-owned startup file selected for this shell.
     */
    private async appendBlock(file: string): Promise<void> {
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
            return;
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.appendFile(
            file,
            `${current.endsWith('\n') || !current ? '' : '\n'}\n${createGodotPathBlock(this.binDirectory)}`,
            { mode: 0o600 },
        );
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
     */
    private async findShellConflict(shell: string): Promise<string | null> {
        if (!['bash', 'zsh', 'sh', 'fish'].includes(shell)) {
            for (const directory of (this.options.env.PATH || '').split(
                path.delimiter,
            )) {
                const candidate = path.resolve(directory || '.', 'godot');
                try {
                    await fs.access(candidate, fs.constants.X_OK);
                    if (candidate !== this.wrapperPath) return candidate;
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
                            ? "if type -t godot | string match -q function; printf '%s\\n' 'godot (Fish function or alias)'; else; command -s godot; end"
                            : 'command -v godot',
                    ],
                    {
                        env: this.options.env,
                        timeout: 5000,
                        maxBuffer: 64 * 1024,
                    },
                );
                const command = result.stdout.trim().split('\n').at(-1)?.trim();
                if (command && command !== this.wrapperPath) return command;
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

    /** Preserves the raw user registry PATH and broadcasts changes without elevation. */
    private async registerWindows(): Promise<string | null> {
        if (this.options.fixture) {
            await fs.writeFile(
                path.join(this.binDirectory, '.fixture-user-path'),
                this.binDirectory,
            );
            return null;
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
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class GodotPathChange { [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result); }'
    $result = [UIntPtr]::Zero
    [void][GodotPathChange]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
  }
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $effective = [Environment]::ExpandEnvironmentVariables($machine + ';' + $raw)
  foreach ($entry in ($effective -split ';')) {
    if ([string]::IsNullOrWhiteSpace($entry)) { continue }
    foreach ($extension in @('.com', '.exe', '.bat', '.cmd')) {
      $candidate = Join-Path $entry ('godot' + $extension)
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        if ($candidate -ine (Join-Path $bin 'godot.cmd')) { Write-Output $candidate }
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
        return stdout.trim() || null;
    }
}
