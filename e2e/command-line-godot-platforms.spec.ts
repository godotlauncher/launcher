import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CommandLinePathAdapter } from '../main/src/editor-installs/command-line-path.adapter';
import { createGodotWrapper } from '../main/src/editor-installs/command-line-godot.util';

test('Fish registers a missing command and reports an overriding function', async () => {
    test.skip(process.platform === 'win32', 'Fish registration uses a Unix shell.');
    const lookup = await run('/bin/sh', ['-c', 'command -v fish'], process.env);
    const fish = lookup.stdout.trim();
    test.skip(lookup.code !== 0 || !fish, 'Fish is not installed on this host.');
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-fish-'));
    try {
        const config = path.join(home, '.config');
        const env = {
            ...process.env, HOME: home, XDG_CONFIG_HOME: config,
            XDG_DATA_HOME: path.join(home, '.local', 'share'),
            XDG_CACHE_HOME: path.join(home, '.cache'), PATH: '/usr/bin:/bin',
        };
        const adapter = new CommandLinePathAdapter({ platform: process.platform, home, env, shell: fish });
        await fs.mkdir(adapter.binDirectory, { recursive: true });
        expect(await adapter.register()).toEqual({ conflict: null, pathChanged: true });
        await fs.writeFile(adapter.wrapperPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const resolved = await run(fish, ['-ic', 'command -s godot'], env);
        expect(resolved.code).toBe(0);
        expect(resolved.stdout.trim()).toBe(adapter.wrapperPath);
        await fs.writeFile(path.join(config, 'fish', 'config.fish'), 'function godot\n  echo another-editor\nend\n');
        expect(await adapter.register()).toEqual({ conflict: 'godot (Fish function or alias)', pathChanged: false });
    } finally {
        await fs.rm(home, { recursive: true, force: true });
    }
});

for (const missing of [false, true]) {
    test(`Windows preserves a legacy code page and ${missing ? 'reports a missing target' : 'runs a Unicode editor path'}`, async () => {
        test.skip(process.platform !== 'win32', 'Requires native Windows cmd.exe.');
        const home = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-cmd-'));
        try {
            const directory = path.join(home, '\u00c9diteurs \u6d4b\u8bd5');
            const executable = path.join(directory, 'godot_console.exe');
            await fs.mkdir(directory);
            // A system executable provides a real child exit code without downloading Godot.
            const command = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
            if (!missing) await fs.copyFile(command, executable);
            const wrapper = path.join(home, 'godot.cmd');
            await fs.writeFile(wrapper, createGodotWrapper(executable, 'win32'));
            const driver = path.join(home, 'driver.cmd');
            await fs.writeFile(driver, [
                '@echo off',
                'setlocal DisableDelayedExpansion',
                'for /f "tokens=2 delims=:" %%C in (\'chcp\') do set "ORIGINAL_CODEPAGE=%%C"',
                'chcp 437 >nul',
                'call "%GODOT_TEST_WRAPPER%" /d /c exit 37',
                'set "GODOT_TEST_EXIT=%errorlevel%"',
                'chcp',
                'if defined ORIGINAL_CODEPAGE chcp %ORIGINAL_CODEPAGE% >nul',
                'exit /b %GODOT_TEST_EXIT%', '',
            ].join('\r\n'));
            const result = await run(command, ['/d', '/s', '/c', `""${driver}""`], { ...process.env, GODOT_TEST_WRAPPER: wrapper }, true);
            expect(result.code).toBe(missing ? 127 : 37);
            expect(result.stdout).toMatch(/437/);
            if (missing) expect(result.stderr).toContain('selected Godot editor is unavailable');
            else expect(result.stderr).toBe('');
        } finally {
            await fs.rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
    });
}

/**
 * Runs a native shell with captured output and its actual exit status.
 * @param executable - Shell executable.
 * @param args - Shell arguments.
 * @param env - Isolated child environment.
 * @param verbatim - Whether Windows arguments already contain cmd.exe quoting.
 */
function run(executable: string, args: string[], env: NodeJS.ProcessEnv, verbatim = false): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(executable, args, { env, timeout: 10000, maxBuffer: 64 * 1024, windowsVerbatimArguments: verbatim }, (error, stdout, stderr) => {
            if (error && typeof error.code !== 'number') reject(error);
            else resolve({ code: typeof error?.code === 'number' ? error.code : 0, stdout, stderr });
        });
    });
}
