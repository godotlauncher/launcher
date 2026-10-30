import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    readFile: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    spawn: vi.fn(),
    bundle: vi.fn(),
    warn: vi.fn(),
    send: vi.fn(),
    window: vi.fn(),
}));
vi.mock('../mainWindow.js', () => ({ getMainWindow: mocks.window }));
vi.mock('../helpers/tray.helper.js', () => ({ updateLinuxTray: vi.fn() }));
vi.mock('../utils.js', () => ({ ipcWebContentsSend: mocks.send }));
vi.mock('node:fs/promises', () => ({
    readFile: mocks.readFile,
    stat: mocks.stat,
    access: mocks.access,
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('electron-log', () => ({ default: { warn: mocks.warn } }));
vi.mock('./project-terminal-launch.macos.util.js', () => ({
    resolveBundleExecutable: mocks.bundle,
}));
vi.mock('./projects.store.js', () => ({
    ProjectsStore: class ProjectsStore {},
}));

import { ProjectRunService } from './project-run.service.js';

const projectPath = path.resolve('projects', "artist's demo");
const executable = path.resolve('editors', 'Godot');
const project = {
    path: projectPath,
    launch_path: executable,
    release: {},
    open_windowed: true,
    launch_with_console: true,
} as ProjectDetails;

/** Creates a controllable native child boundary. */
function createChild() {
    return Object.assign(new EventEmitter(), {
        stdout: Object.assign(new EventEmitter(), {
            unref: vi.fn(),
            setEncoding: vi.fn(),
        }),
        stderr: Object.assign(new EventEmitter(), {
            unref: vi.fn(),
            setEncoding: vi.fn(),
        }),
        unref: vi.fn(),
    });
}

/** Completes the native child lifecycle after draining both output streams.
 * @param child - Mock native process.
 * @param code - Native exit code.
 * @param signal - Optional termination signal.
 */
function exitChild(
    child: ReturnType<typeof createChild>,
    code: number | null,
    signal: NodeJS.Signals | null = null,
) {
    child.emit('exit', code, signal);
    child.stdout.emit('end');
    child.stderr.emit('end');
    child.emit('close', code, signal);
}

describe('ProjectRunService', () => {
    let service: ProjectRunService;
    let files: Map<string, string>;
    let child: ReturnType<typeof createChild>;
    let list: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mocks.window.mockReturnValue({
            webContents: { isDestroyed: () => false },
        });
        files = new Map([
            [
                path.join(projectPath, 'project.godot'),
                '[application]\nrun/main_scene="res://main.tscn"',
            ],
        ]);
        mocks.readFile.mockImplementation(async (filename: string) => {
            if (!files.has(filename))
                throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            return files.get(filename);
        });
        mocks.stat.mockImplementation(async (filename: string) => {
            if (
                filename === path.join(projectPath, 'override.cfg') &&
                !files.has(filename)
            )
                throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            return { isFile: () => true };
        });
        mocks.access.mockResolvedValue(undefined);
        mocks.bundle.mockResolvedValue(executable);
        child = createChild();
        mocks.spawn.mockImplementation(() => {
            Promise.resolve().then(() => child.emit('spawn'));
            return child;
        });
        list = vi.fn().mockResolvedValue([project]);
        service = new ProjectRunService({ list } as never);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('runs Godot with a clean AppImage environment and retains user .NET settings', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' });
        vi.stubEnv('APPDIR', '/tmp/.mount_launcher');
        vi.stubEnv('APPIMAGE', '/downloads/launcher.AppImage');
        vi.stubEnv(
            'LD_LIBRARY_PATH',
            '/tmp/.mount_launcher/usr/lib:/opt/user/lib',
        );
        vi.stubEnv('DOTNET_ROOT', '/opt/dotnet');
        await expect(service.runProject(projectPath)).resolves.toEqual({
            launched: true,
        });
        const environment = mocks.spawn.mock.lastCall?.[2].env;
        expect(environment.LD_LIBRARY_PATH).toBe('/opt/user/lib');
        expect(environment.DOTNET_ROOT).toBe('/opt/dotnet');
        expect(environment.APPDIR).toBeUndefined();
        expect(environment.APPIMAGE).toBeUndefined();
    });

    it('only accepts exact registered paths', async () => {
        await expect(
            service.runProject(`${projectPath}${path.sep}other`),
        ).resolves.toEqual({ launched: false, reason: 'project_unavailable' });
        expect(mocks.readFile).not.toHaveBeenCalled();
        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it.each(['', '[application]\nrun/main_scene=""'])(
        'explains absent main scenes (%s)',
        async (content) => {
            files.set(path.join(projectPath, 'project.godot'), content);
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'missing_main_scene' });
        },
    );

    it('distinguishes missing project and editor files', async () => {
        mocks.stat.mockRejectedValueOnce(
            Object.assign(new Error('missing'), { code: 'ENOENT' }),
        );
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'project_unavailable',
        });
        mocks.access.mockRejectedValueOnce(new Error('not executable'));
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'editor_unavailable',
        });
    });

    it.each([
        'run/main_scene="uid://b"',
        'run/main_scene="res://missing.tscn"',
        'run/main_scene=""\nrun/main_scene.android="res://mobile.tscn"',
        'run/main_scene.macos="res://main.tscn"',
        'config/project_settings_override="res://custom.cfg"',
        'config/project_settings_override.windows="/custom.cfg"',
        '[application/run]\nmain_scene="res://main.tscn"',
        '[application/config]\nproject_settings_override="res://custom.cfg"',
        '"config/project_settings_override"="res://custom.cfg"',
        'run/main_scene=""\n[application/run]\nmain_scene="res://main.tscn"',
        '"run/main_\\u0073cene"="res://main.tscn"',
        'run/main_scene=malformed_value',
        'run/main_scene="res://main.tscn"\nconfig/features=PackedStringArray("4.6", "C#")',
    ])(
        'leaves uncertain or configured scenes to Godot: %s',
        async (settings) => {
            files.set(
                path.join(projectPath, 'project.godot'),
                `[application]\n${settings}`,
            );
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'ready' });
            expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith(
                path.join(projectPath, 'project.godot'),
                'utf8',
            );
        },
    );

    it.each([
        '[application]\nrun/main_scene=',
        '[application\nrun/main_scene="res://main.tscn"',
        '[application',
        '[application]\nrun/main_scene=""\nconfig/project_settings_override=',
        '[application]\nrun/main_scene=""\nrun/main_scene.macos=',
        '[application]\nrun/main_scene=""\nrun/main_scene=',
    ])('leaves malformed declarations to Godot: %s', async (source) => {
        files.set(path.join(projectPath, 'project.godot'), source);
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it('leaves existing override files to Godot without interpreting their values', async () => {
        files.set(path.join(projectPath, 'project.godot'), '[application]');
        files.set(
            path.join(projectPath, 'override.cfg'),
            '[application]\nrun/main_scene="res://main.tscn"',
        );
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
        expect(mocks.readFile).not.toHaveBeenCalledWith(
            path.join(projectPath, 'override.cfg'),
            'utf8',
        );
    });

    it('allows Godot to handle configuration read failures', async () => {
        mocks.readFile.mockRejectedValueOnce(new Error('unreadable settings'));
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it('keeps Run available if override-file availability is uncertain', async () => {
        files.set(path.join(projectPath, 'project.godot'), '[application]');
        mocks.stat.mockImplementation(async (filename) => {
            if (filename === path.join(projectPath, 'override.cfg'))
                throw new Error('permission denied');
            return { isFile: () => true };
        });
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it.each(['ERROR:', 'SCRIPT ERROR:', 'Error:'])(
        'shows Godot %s diagnostics without waiting for exit',
        async (prefix) => {
            await service.runProject(projectPath);
            child.stderr.emit(
                'data',
                Buffer.from(`${prefix} Project needs attention.\n`),
            );
            expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
                'project-run-diagnostic',
                expect.anything(),
                {
                    project,
                    diagnostic: `${prefix} Project needs attention.`,
                },
            );
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'already_running' });
            exitChild(child, 0);
            expect(mocks.send).toHaveBeenCalledTimes(1);
        },
    );

    it('handles fragmented diagnostics, logs later errors and reports a later failure', async () => {
        await service.runProject(projectPath);
        child.stdout.emit('data', Buffer.from('Godot Engine\nERR'));
        expect(mocks.send).not.toHaveBeenCalled();
        child.stdout.emit('data', Buffer.from('OR: Cannot open main scene.\n'));
        child.stderr.emit('data', Buffer.from('ERROR: Another error.\n'));
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'ERROR: Cannot open main scene.',
            },
        );
        expect(mocks.warn).toHaveBeenCalledWith(
            'Godot runtime diagnostic',
            'ERROR: Another error.',
        );
        exitChild(child, 1);
        expect(mocks.send).toHaveBeenCalledTimes(2);
        expect(mocks.send).toHaveBeenLastCalledWith(
            'project-run-failed',
            expect.anything(),
            {
                project,
                reason: 'launch_failed',
                diagnostic: 'ERROR: Cannot open main scene.',
            },
        );
    });

    it('does not let unterminated stdout obscure stderr diagnostics', async () => {
        await service.runProject(projectPath);
        child.stdout.emit('data', Buffer.from('Loading game'));
        child.stderr.emit(
            'data',
            Buffer.from('ERROR: Could not load main scene.\n'),
        );
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'ERROR: Could not load main scene.',
            },
        );
    });

    it('shows CRLF error diagnostics from Windows-style output', async () => {
        await service.runProject(projectPath);
        child.stderr.emit(
            'data',
            Buffer.from('ERROR: Windows-style diagnostic.\r\n'),
        );
        exitChild(child, 0);
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'ERROR: Windows-style diagnostic.',
            },
        );
    });

    it('waits for a complete error line rather than showing a prefix-only chunk', async () => {
        await service.runProject(projectPath);
        child.stderr.emit('data', Buffer.from('ERROR:'));
        expect(mocks.send).not.toHaveBeenCalled();
        child.stderr.emit('data', Buffer.from(' Full explanation follows.\n'));
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'ERROR: Full explanation follows.',
            },
        );
    });

    it('flushes an unterminated diagnostic on a normal exit', async () => {
        await service.runProject(projectPath);
        child.stderr.emit(
            'data',
            Buffer.from('ERROR: Explanation without a newline.'),
        );
        expect(mocks.send).not.toHaveBeenCalled();
        exitChild(child, 0);
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'ERROR: Explanation without a newline.',
            },
        );
    });

    it('caps diagnostics from a very long unterminated error line', async () => {
        await service.runProject(projectPath);
        child.stderr.emit('data', Buffer.from(`ERROR: ${'x'.repeat(20000)}`));
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.send.mock.calls[0][2].diagnostic).toHaveLength(2000);
    });

    it('reports error output that arrives after a zero-code exit but before stream closure', async () => {
        await service.runProject(projectPath);
        child.stderr.emit('data', Buffer.from('SCRIPT ERR'));
        child.emit('exit', 0, null);
        child.stderr.emit('data', Buffer.from('OR: Missing C# class.\n'));
        child.emit('close', 0, null);
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
            'project-run-diagnostic',
            expect.anything(),
            {
                project,
                diagnostic: 'SCRIPT ERROR: Missing C# class.',
            },
        );
    });

    it('does not turn ordinary output or warnings into runtime failures', async () => {
        await service.runProject(projectPath);
        child.stderr.emit(
            'data',
            Buffer.from('WARNING: A harmless warning.\n'),
        );
        child.stdout.emit(
            'data',
            Buffer.from('No ERROR: this text is not an engine diagnostic.\n'),
        );
        exitChild(child, 0);
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it.each(['nonzero', 'signal'])(
        'publishes exactly one recovery event after a late %s failure',
        async (failure) => {
            const run = service.runProject(projectPath);
            await run;
            await expect(run).resolves.toEqual({ launched: true });
            exitChild(
                child,
                failure === 'nonzero' ? 1 : null,
                failure === 'signal' ? 'SIGTERM' : null,
            );
            exitChild(child, 1);
            expect(mocks.send).toHaveBeenCalledTimes(1);
            expect(mocks.send).toHaveBeenCalledWith(
                'project-run-failed',
                expect.anything(),
                { project, reason: 'launch_failed' },
            );
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'ready' });
        },
    );

    it.each(['nonzero', 'signal', 'error'])(
        'reports a %s failure after warning and warns again on a fresh run',
        async (failure) => {
            await service.runProject(projectPath);
            child.stderr.emit('data', 'ERROR: Recovered graphics error.\n');
            await expect(service.runProject(projectPath)).resolves.toEqual({
                launched: false,
                reason: 'already_running',
            });
            if (failure === 'error')
                child.emit('error', new Error('runtime failed'));
            exitChild(
                child,
                failure === 'signal' ? null : 7,
                failure === 'signal' ? 'SIGTERM' : null,
            );
            expect(mocks.send.mock.calls.map(([event]) => event)).toEqual([
                'project-run-diagnostic',
                'project-run-failed',
            ]);
            child = createChild();
            await service.runProject(projectPath);
            child.stderr.emit('data', 'SCRIPT ERROR: New run.\n');
            expect(mocks.send.mock.lastCall?.[0]).toBe(
                'project-run-diagnostic',
            );
        },
    );

    it('logs diagnostics without publishing after a failure or window destruction', async () => {
        await service.runProject(projectPath);
        child.emit('error', new Error('runtime failed'));
        child.stderr.emit('data', 'ERROR: Late output.\n');
        expect(mocks.send).toHaveBeenCalledTimes(1);
        mocks.window.mockReturnValue({
            webContents: { isDestroyed: () => true },
        });
        child = createChild();
        await service.runProject(projectPath);
        child.stderr.emit('data', 'ERROR: No live window.\n');
        expect(mocks.send).toHaveBeenCalledTimes(1);
        expect(mocks.warn).toHaveBeenCalledWith(
            'Godot runtime diagnostic',
            'ERROR: No live window.',
        );
    });

    it('does not publish recovery for a normal exit', async () => {
        await service.runProject(projectPath);
        exitChild(child, 0);
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it('ignores late failures after the main window is destroyed', async () => {
        const run = service.runProject(projectPath);
        await run;
        mocks.window.mockReturnValue({
            webContents: { isDestroyed: () => true },
        });
        exitChild(child, 1);
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it.each(['linux', 'win32', 'darwin'])(
        'starts a native runtime with literal arguments on %s',
        async (platform) => {
            vi.stubGlobal('process', { ...process, platform });
            const run = service.runProject(projectPath);
            await run;
            await expect(run).resolves.toEqual({ launched: true });
            expect(mocks.spawn).toHaveBeenCalledWith(
                platform === 'win32' ? executable : '/bin/sh',
                platform === 'win32'
                    ? ['--path', projectPath]
                    : [
                          '-c',
                          'trap "" PIPE; exec "$@"',
                          'godot-launcher-run',
                          executable,
                          '--path',
                          projectPath,
                      ],
                expect.objectContaining({
                    detached: true,
                    shell: false,
                    cwd: projectPath,
                }),
            );
            expect(child.unref).toHaveBeenCalled();
            expect(child.stderr.unref).toHaveBeenCalled();
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'already_running' });
        },
    );

    it('resolves custom macOS bundles rather than using open', async () => {
        vi.stubGlobal('process', { ...process, platform: 'darwin' });
        const bundlePath = path.resolve('editors', 'Custom Godot.app');
        list.mockResolvedValue([{ ...project, launch_path: bundlePath }]);
        const run = service.runProject(projectPath);
        await run;
        await expect(run).resolves.toEqual({ launched: true });
        expect(mocks.bundle).toHaveBeenCalledWith(bundlePath);
        expect(mocks.spawn.mock.calls[0][1]).toEqual([
            '-c',
            'trap "" PIPE; exec "$@"',
            'godot-launcher-run',
            executable,
            '--path',
            projectPath,
        ]);
    });

    it('prevents repeated clicks during checks and while the owned child is alive', async () => {
        const run = service.runProject(projectPath);
        await expect(service.runProject(projectPath)).resolves.toEqual({
            launched: false,
            reason: 'already_running',
        });
        await run;
        await expect(run).resolves.toEqual({ launched: true });
        await expect(service.runProject(projectPath)).resolves.toEqual({
            launched: false,
            reason: 'already_running',
        });
        exitChild(child, 0);
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it('returns a native spawn error without duplicating recovery events', async () => {
        mocks.spawn.mockReturnValue(child);
        const run = service.runProject(projectPath);
        await vi.advanceTimersByTimeAsync(0);
        child.emit('error', new Error('spawn failed'));
        await expect(run).resolves.toEqual({
            launched: false,
            reason: 'launch_failed',
        });
        expect(mocks.send).not.toHaveBeenCalled();
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it.each(['error', 'nonzero', 'signal'])(
        'reports a %s failure immediately after dispatch and permits retry',
        async (failure) => {
            await expect(service.runProject(projectPath)).resolves.toEqual({
                launched: true,
            });
            if (failure === 'error')
                child.emit('error', new Error('runtime failed'));
            else
                exitChild(
                    child,
                    failure === 'nonzero' ? 1 : null,
                    failure === 'signal' ? 'SIGTERM' : null,
                );
            expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
                'project-run-failed',
                expect.anything(),
                { project, reason: 'launch_failed' },
            );
            await expect(
                service.inspectProjectRun(projectPath),
            ).resolves.toEqual({ status: 'ready' });
        },
    );

    it('bounds failure diagnostics throughout the runtime lifetime', async () => {
        await service.runProject(projectPath);
        child.stderr.emit('data', Buffer.from('x'.repeat(20000)));
        exitChild(child, 1);
        expect(mocks.warn.mock.calls[0][1]).toHaveLength(16384);
        expect(mocks.send).toHaveBeenCalledTimes(1);
    });

    it('does not let a failed old child release the next runtime guard', async () => {
        await service.runProject(projectPath);
        const previous = child;
        previous.emit('error', new Error('runtime failed'));
        child = createChild();
        await service.runProject(projectPath);
        exitChild(previous, 1);
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'already_running',
        });
        expect(mocks.send).toHaveBeenCalledTimes(1);
    });

    it('releases the guard when native spawning throws synchronously', async () => {
        mocks.spawn.mockImplementationOnce(() => {
            throw new Error('spawn failed');
        });
        await expect(service.runProject(projectPath)).resolves.toEqual({
            launched: false,
            reason: 'launch_failed',
        });
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it('accepts a game that completes immediately after dispatch', async () => {
        const run = service.runProject(projectPath);
        await run;
        exitChild(child, 0);
        await expect(run).resolves.toEqual({ launched: true });
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
    });

    it('freshly rechecks readiness when Run is selected', async () => {
        await expect(service.inspectProjectRun(projectPath)).resolves.toEqual({
            status: 'ready',
        });
        files.set(path.join(projectPath, 'project.godot'), '[application]');
        await expect(service.runProject(projectPath)).resolves.toEqual({
            launched: false,
            reason: 'missing_main_scene',
        });
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
