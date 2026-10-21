import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLinePathAdapter } from './command-line-path.adapter.js';

const fs = vi.hoisted(() => ({
    readFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    appendFile: vi.fn(),
    writeFile: vi.fn(),
    constants: { X_OK: 1 },
}));
const execution = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:fs/promises', () => fs);
vi.mock('node:child_process', () => execution);
const home = path.resolve('fixture-home');

describe('per-user command PATH registration', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fs.readFile.mockResolvedValue('export EDITOR=vim\n');
        fs.access.mockRejectedValue(
            Object.assign(new Error('Missing'), { code: 'ENOENT' }),
        );
        execution.execFile.mockImplementation(
            (_file, args, options, callback) => {
                if (args[0] === '-c')
                    callback(
                        null,
                        `\nGODOT_LAUNCHER_ZDOTDIR=${options.env.ZDOTDIR || home}\n`,
                        '',
                    );
                else
                    callback(
                        Object.assign(new Error('No command'), { code: 1 }),
                        '',
                        '',
                    );
            },
        );
    });

    it('preserves Zsh content and uses ZDOTDIR without duplicating its block', async () => {
        const dotdir = path.join(home, 'zsh');
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: { ZDOTDIR: dotdir },
            shell: '/bin/zsh',
        });
        expect(await adapter.register()).toEqual({
            conflict: null,
            pathChanged: true,
        });
        expect(fs.appendFile).toHaveBeenCalledWith(
            path.join(dotdir, '.zshrc'),
            expect.stringContaining('Godot Launcher PATH'),
            expect.anything(),
        );
        const appended = fs.appendFile.mock.calls[0][1];
        fs.readFile.mockResolvedValue(`export EDITOR=vim\n${appended}`);
        fs.appendFile.mockClear();
        expect(await adapter.register()).toEqual({
            conflict: null,
            pathChanged: false,
        });
        expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it('uses an existing Bash login profile and never creates a masking one', async () => {
        fs.access.mockImplementation(async (file) => {
            if (file === path.join(home, '.profile')) return;
            throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
        });
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/bash',
        });
        await adapter.register();
        expect(fs.appendFile.mock.calls.map((call) => call[0])).toEqual([
            path.join(home, '.bashrc'),
            path.join(home, '.profile'),
        ]);
    });

    it('reports existing commands and does not execute or replace them', async () => {
        execution.execFile.mockImplementation(
            (_file, args, options, callback) =>
                callback(
                    null,
                    args[0] === '-c'
                        ? `\nGODOT_LAUNCHER_ZDOTDIR=${options.env.ZDOTDIR || home}\n`
                        : '/usr/bin/godot\n',
                    '',
                ),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/bash',
        });
        expect(await adapter.register()).toEqual({
            conflict: '/usr/bin/godot',
            pathChanged: true,
        });
        expect(execution.execFile.mock.calls[0][1]).toEqual([
            '-ic',
            'command -v godot',
        ]);
    });

    it('detects a Godot command introduced only by a login profile', async () => {
        execution.execFile.mockImplementation(
            (_file, args, options, callback) => {
                if (args[0] === '-c')
                    callback(
                        null,
                        `\nGODOT_LAUNCHER_ZDOTDIR=${options.env.ZDOTDIR || home}\n`,
                        '',
                    );
                else if (args[0] === '-lic')
                    callback(null, '/login/bin/godot\n', '');
                else
                    callback(
                        Object.assign(new Error('No command'), { code: 1 }),
                        '',
                        '',
                    );
            },
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/zsh',
        });
        expect(await adapter.register()).toEqual({
            conflict: '/login/bin/godot',
            pathChanged: true,
        });
    });

    it('allows manual PATH setup for an unsupported shell without editing its files', async () => {
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/other-shell',
        });
        const configured = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: { PATH: adapter.binDirectory },
            shell: '/bin/other-shell',
        });
        expect(await configured.register()).toEqual({
            conflict: null,
            pathChanged: false,
        });
        expect(fs.appendFile).not.toHaveBeenCalled();
        expect(execution.execFile).not.toHaveBeenCalled();
    });

    it('fails visibly rather than treating inaccessible profiles as empty files', async () => {
        fs.readFile.mockRejectedValue(
            Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/zsh',
        });
        await expect(adapter.register()).rejects.toThrow('Permission denied');
        expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it('uses append semantics in a managed Fish configuration without changing universal paths', async () => {
        fs.readFile.mockRejectedValue(
            Object.assign(new Error('Missing'), { code: 'ENOENT' }),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/usr/bin/fish',
        });
        await adapter.register();
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(home, '.config', 'fish', 'conf.d', 'godot-launcher.fish'),
            expect.stringContaining('fish_add_path --global --path --append'),
            expect.objectContaining({ flag: 'wx' }),
        );
    });

    it('does not report Fish PATH changes when its managed file already exists', async () => {
        fs.readFile.mockRejectedValueOnce(
            Object.assign(new Error('Missing'), { code: 'ENOENT' }),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/usr/bin/fish',
        });
        expect(await adapter.register()).toEqual({
            conflict: null,
            pathChanged: true,
        });
        fs.readFile.mockResolvedValue(fs.writeFile.mock.calls[0][1]);
        fs.writeFile.mockClear();
        expect(await adapter.register()).toEqual({
            conflict: null,
            pathChanged: false,
        });
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('reports a Bash login-profile repair even when its interactive block already exists', async () => {
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/bin/bash',
        });
        await adapter.register();
        const block = fs.appendFile.mock.calls[0][1];
        fs.appendFile.mockClear();
        fs.readFile.mockImplementation(async (file) =>
            file === path.join(home, '.bashrc') ? block : 'export EDITOR=vim\n',
        );
        expect(await adapter.register()).toEqual({
            conflict: null,
            pathChanged: true,
        });
        expect(fs.appendFile.mock.calls.map((call) => call[0])).toEqual([
            path.join(home, '.profile'),
        ]);
    });

    it('sets up Fish when command lookup returns its missing-command status', async () => {
        execution.execFile.mockImplementation(
            (_file, _args, _options, callback) =>
                callback(
                    Object.assign(new Error('No command'), { code: 127 }),
                    '',
                    '',
                ),
        );
        fs.readFile.mockRejectedValue(
            Object.assign(new Error('Missing'), { code: 'ENOENT' }),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/usr/bin/fish',
        });
        await expect(adapter.register()).resolves.toEqual({
            conflict: null,
            pathChanged: true,
        });
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(home, '.config', 'fish', 'conf.d', 'godot-launcher.fish'),
            expect.stringContaining('fish_add_path'),
            expect.anything(),
        );
    });

    it('reports a Fish function even when a managed executable exists below it', async () => {
        const adapter = new CommandLinePathAdapter({
            platform: 'linux',
            home,
            env: {},
            shell: '/usr/bin/fish',
        });
        execution.execFile.mockImplementation(
            (_file, args, _options, callback) => {
                const checksFunctions = args[1].includes('type -t godot');
                callback(
                    null,
                    checksFunctions
                        ? 'godot (Fish function or alias)\n'
                        : `${adapter.wrapperPath}\n`,
                    '',
                );
            },
        );
        fs.readFile.mockRejectedValue(
            Object.assign(new Error('Missing'), { code: 'ENOENT' }),
        );
        expect(await adapter.register()).toEqual({
            conflict: 'godot (Fish function or alias)',
            pathChanged: true,
        });
    });

    it('updates only raw Windows user PATH and broadcasts without elevation', async () => {
        execution.execFile.mockImplementation(
            (_file, _args, _options, callback) =>
                callback(null, 'C:\\Existing\\godot.exe\r\n', ''),
        );
        const adapter = new CommandLinePathAdapter({
            platform: 'win32',
            home: 'C:\\Users\\Test',
            env: {},
            shell: 'cmd.exe',
        });
        expect(await adapter.register()).toEqual({
            conflict: 'C:\\Existing\\godot.exe',
            pathChanged: false,
        });
        const [file, args] = execution.execFile.mock.calls[0];
        expect(file).toBe(
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        );
        const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
        expect(script).toContain('DoNotExpandEnvironmentNames');
        expect(script).toContain("$key.SetValue('Path', $updated, $kind)");
        expect(script).toContain('SendMessageTimeout');
        expect(script).not.toContain('RunAs');
        execution.execFile.mockImplementation(
            (_file, _args, _options, callback) =>
                callback(
                    null,
                    'GODOT_LAUNCHER_PATH_CHANGED\r\nC:\\Existing\\godot.exe\r\n',
                    '',
                ),
        );
        expect(await adapter.register()).toEqual({
            conflict: 'C:\\Existing\\godot.exe',
            pathChanged: true,
        });
    });
});
