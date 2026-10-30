import type { ExecFileException } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
    execFile: vi.fn(),
}));

vi.mock('node:child_process', () => processMocks);

import { ToolProcessExecutor } from './tool-process.executor.js';

const installation = {
    executablePath: '/tools/example',
    executableArgs: ['--prefix'],
    version: '1.0.0',
    source: 'detected' as const,
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('ToolProcessExecutor', () => {
    it('executes the exact path and argument array without a shell', async () => {
        processMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: readonly string[],
                _options: object,
                callback: (
                    error: ExecFileException | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(null, 'output', '');
            },
        );

        await expect(
            new ToolProcessExecutor().execute(installation, {
                args: ['status', '--short'],
                cwd: '/project',
            }),
        ).resolves.toEqual({
            success: true,
            stdout: 'output',
            stderr: '',
            exitCode: 0,
        });
        expect(processMocks.execFile).toHaveBeenCalledWith(
            '/tools/example',
            ['--prefix', 'status', '--short'],
            expect.objectContaining({
                cwd: '/project',
                shell: false,
                windowsHide: true,
            }),
            expect.any(Function),
        );
    });

    it('reports a killed process as timed out', async () => {
        processMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: readonly string[],
                _options: object,
                callback: (
                    error: ExecFileException | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                const error = Object.assign(new Error('timeout'), {
                    killed: true,
                }) as ExecFileException;
                callback(error, '', 'timed out');
            },
        );

        await expect(
            new ToolProcessExecutor().execute(installation, { args: [] }),
        ).resolves.toEqual({
            success: false,
            reason: 'timed-out',
            stdout: '',
            stderr: 'timed out',
            exitCode: null,
        });
    });

    it('can replace the inherited environment for isolated commands', async () => {
        processMocks.execFile.mockImplementation(
            (
                _file: string,
                _args: readonly string[],
                _options: object,
                callback: (
                    error: ExecFileException | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => callback(null, '', ''),
        );
        const environment = { LANG: 'C', GIT_CONFIG_NOSYSTEM: '1' };

        await new ToolProcessExecutor().execute(installation, {
            args: ['config'],
            env: environment,
            inheritEnv: false,
        });

        expect(processMocks.execFile).toHaveBeenCalledWith(
            '/tools/example',
            ['--prefix', 'config'],
            expect.objectContaining({ env: environment }),
            expect.any(Function),
        );
    });

    it('returns a structured failure when process creation throws', async () => {
        processMocks.execFile.mockImplementation(() => {
            throw new TypeError('Invalid command');
        });

        await expect(
            new ToolProcessExecutor().execute(installation, { args: [] }),
        ).resolves.toEqual({
            success: false,
            reason: 'command-failed',
            stdout: '',
            stderr: '',
            exitCode: null,
        });
    });
});

it('cleans inherited AppImage values before applying tool overrides', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    vi.stubEnv('APPDIR', '/tmp/.mount_launcher');
    vi.stubEnv('APPIMAGE', '/downloads/launcher.AppImage');
    vi.stubEnv('PATH', '/tmp/.mount_launcher:/usr/bin');
    vi.stubEnv('LD_LIBRARY_PATH', '/tmp/.mount_launcher/usr/lib:/opt/user/lib');
    processMocks.execFile.mockImplementation(
        (_file, _args, _options, callback) => callback(null, '', ''),
    );
    await new ToolProcessExecutor().execute(installation, {
        args: [],
        env: { LD_LIBRARY_PATH: '/opt/project/lib', CUSTOM: 'project' },
    });
    const env = processMocks.execFile.mock.lastCall?.[2].env;
    expect(env.PATH).toBe('/usr/bin');
    expect(env.LD_LIBRARY_PATH).toBe('/opt/project/lib');
    expect(env.CUSTOM).toBe('project');
    expect(env.APPDIR).toBeUndefined();
    expect(env.APPIMAGE).toBeUndefined();
    expect(process.env.APPDIR).toBe('/tmp/.mount_launcher');
});
