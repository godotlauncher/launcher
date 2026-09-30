import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    stat: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
    writeFile: vi.fn(),
    spawn: vi.fn(),
}));
vi.mock('node:fs/promises', () => mocks);
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('electron', () => ({ app: { getPath: () => '/temp' } }));

import { launchWindowsTerminal } from './project-terminal-launch.windows.util.js';

const engine = 'C:\\project settings\\Godot.exe';
const wrapper = 'C:\\project settings\\Godot_console.exe';
const project = 'C:\\projects\\50% ! demo & café';
const directory = path.join('/temp', 'godot-launch-test');

/** Creates a dispatcher that accepts the request on the next event loop turn. */
function createDispatcher() {
    const dispatcher = new EventEmitter();
    queueMicrotask(() => dispatcher.emit('exit', 0));
    return dispatcher;
}

describe('Windows terminal launch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('SystemRoot', 'C:\\Windows');
        mocks.access.mockResolvedValue(undefined);
        mocks.stat.mockResolvedValue({ isFile: () => true });
        mocks.mkdtemp.mockResolvedValue(directory);
        mocks.writeFile.mockResolvedValue(undefined);
        mocks.rm.mockResolvedValue(undefined);
        mocks.spawn.mockImplementation(createDispatcher);
    });
    afterEach(() => vi.unstubAllEnvs());

    it('prefers the project-local wrapper and preserves special characters through environment values', async () => {
        vi.stubEnv('godot_launch_project', 'Unrelated inherited value');
        await launchWindowsTerminal(engine, project, true);
        const [executable, args, options] = mocks.spawn.mock.calls[0];
        expect(executable).toBe('C:\\Windows\\System32\\cmd.exe');
        expect(args).toEqual([
            '/d',
            '/e:on',
            '/v:off',
            '/c',
            'start "" "%GODOT_LAUNCH_COMMAND_PROMPT%" /d /e:on /v:off /c launch.bat',
        ]);
        expect(options).toMatchObject({
            cwd: directory,
            shell: false,
            stdio: 'ignore',
            windowsVerbatimArguments: true,
        });
        expect(options.env.GODOT_LAUNCH_EXECUTABLE).toBe(wrapper);
        expect(options.env.GODOT_LAUNCH_PROJECT).toBe(project);
        expect(options.env.GODOT_LAUNCH_PROJECT_ARGUMENT).toBe(project);
        expect(options.env.godot_launch_project).toBeUndefined();
        const [scriptPath, script, writeOptions] =
            mocks.writeFile.mock.calls[0];
        expect(scriptPath).toBe(path.join(directory, 'launch.bat'));
        expect(script).not.toContain(project);
        expect(script).toContain('DisableDelayedExpansion');
        expect(script).toContain(
            '"%GODOT_LAUNCH_EXECUTABLE%" --path "%GODOT_LAUNCH_PROJECT_ARGUMENT%" -e -w\r\n',
        );
        expect(script).toContain('GODOT_LAUNCH_EXIT_CODE=%ERRORLEVEL%');
        expect(script).toContain('Press Return to finish...');
        expect(script).toContain('set /p "GODOT_LAUNCH_ACK="');
        expect(script).toContain('del "%~f0" & rmdir "%~dp0"');
        expect(writeOptions).toMatchObject({
            encoding: 'ascii',
            mode: 0o700,
            flag: 'wx',
        });
        expect(mocks.rm).not.toHaveBeenCalled();
    });

    it('uses the registered console basename beside the project editor', async () => {
        await launchWindowsTerminal(
            engine,
            project,
            false,
            'D:\\installed\\Custom.console.exe',
        );
        expect(mocks.spawn.mock.calls[0][2].env.GODOT_LAUNCH_EXECUTABLE).toBe(
            'C:\\project settings\\Custom.console.exe',
        );
    });
    it.each(['missing', 'directory'])(
        'falls back to the regular project editor when the console wrapper is %s',
        async (condition) => {
            if (condition === 'missing')
                mocks.access.mockImplementation(async (file: string) => {
                    if (file === wrapper) throw new Error('Missing wrapper');
                });
            else
                mocks.stat.mockImplementation(async (file: string) => ({
                    isFile: () => file !== wrapper,
                }));
            await launchWindowsTerminal(engine, project, false);
            expect(
                mocks.spawn.mock.calls[0][2].env.GODOT_LAUNCH_EXECUTABLE,
            ).toBe(engine);
            expect(mocks.writeFile.mock.calls[0][1]).toContain(
                '"%GODOT_LAUNCH_PROJECT_ARGUMENT%" -e\r\n',
            );
        },
    );
    it('escapes a drive-root argument for the Godot command line without changing the working directory', async () => {
        await launchWindowsTerminal(engine, 'C:\\', false);
        expect(mocks.spawn.mock.calls[0][2].env.GODOT_LAUNCH_PROJECT).toBe(
            'C:\\',
        );
        expect(
            mocks.spawn.mock.calls[0][2].env.GODOT_LAUNCH_PROJECT_ARGUMENT,
        ).toBe('C:\\\\');
    });
    it('keeps an editor that is itself a console executable', async () => {
        await launchWindowsTerminal(wrapper, project, false);
        expect(mocks.spawn.mock.calls[0][2].env.GODOT_LAUNCH_EXECUTABLE).toBe(
            wrapper,
        );
        expect(mocks.access).not.toHaveBeenCalledWith(
            'C:\\project settings\\Godot_console_console.exe',
            expect.anything(),
        );
    });
    it('rejects a missing editor before allocating a helper', async () => {
        mocks.access.mockImplementation(async (file: string) => {
            if (file.endsWith('.exe') && !file.endsWith('cmd.exe'))
                throw new Error('Missing editor');
        });
        await expect(
            launchWindowsTerminal(engine, project, false),
        ).rejects.toThrow('Godot executable is unavailable');
        expect(mocks.mkdtemp).not.toHaveBeenCalled();
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
    it.each(['write', 'spawn', 'exit'])(
        'removes the private helper after a %s failure',
        async (failure) => {
            if (failure === 'write')
                mocks.writeFile.mockRejectedValue(new Error('Disk full'));
            else
                mocks.spawn.mockImplementation(() => {
                    const dispatcher = new EventEmitter();
                    queueMicrotask(() =>
                        failure === 'spawn'
                            ? dispatcher.emit(
                                  'error',
                                  new Error('Spawn failed'),
                              )
                            : dispatcher.emit('exit', 1),
                    );
                    return dispatcher;
                });
            await expect(
                launchWindowsTerminal(engine, project, false),
            ).rejects.toThrow();
            expect(mocks.rm).toHaveBeenCalledWith(directory, {
                recursive: true,
                force: true,
            });
        },
    );
});
