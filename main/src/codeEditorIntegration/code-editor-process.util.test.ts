import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { launchCodeEditorProcess } from './code-editor-process.util.js';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => mocks);
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

it('passes paths literally without a shell and waits for process dispatch', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const folder = '/projects/My Game; $(unexpected)';
    const launching = launchCodeEditorProcess('/tools/code', [folder]);
    expect(mocks.spawn).toHaveBeenCalledWith('/tools/code', [folder], {
        env: expect.any(Object),
        detached: true,
        stdio: 'ignore',
        shell: false,
    });
    expect(child.unref).not.toHaveBeenCalled();
    child.emit('spawn');
    await launching;
    expect(child.unref).toHaveBeenCalledOnce();
});

it('reports asynchronous executable errors without detaching a failed child', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const launching = expect(
        launchCodeEditorProcess('/missing/code', ['/project']),
    ).rejects.toThrow('ENOENT');
    child.emit('error', new Error('ENOENT'));
    await launching;
    expect(child.unref).not.toHaveBeenCalled();
});

it.each([0, 1])(
    'dispatches a custom Windows wrapper with literal paths and checks exit code %s',
    async (code) => {
        vi.stubGlobal('process', { ...process, platform: 'win32' });
        vi.stubEnv('SystemRoot', 'C:\\Windows');
        const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
        mocks.spawn.mockReturnValue(child);
        const command = 'C:\\Tools & Editors\\code.cmd';
        const folder = 'C:\\Games\\A & B %TEMP% !^';
        const launching = launchCodeEditorProcess(command, [folder]);
        const expected =
            code === 0
                ? expect(launching).resolves.toBeUndefined()
                : expect(launching).rejects.toThrow(
                      'Code editor command wrapper failed',
                  );
        expect(mocks.spawn).toHaveBeenCalledWith(
            'C:\\Windows\\System32\\cmd.exe',
            [
                '/d',
                '/e:on',
                '/v:off',
                '/s',
                '/c',
                '""%GODOT_LAUNCHER_EDITOR_ARG_0%" "%GODOT_LAUNCHER_EDITOR_ARG_1%""',
            ],
            expect.objectContaining({
                shell: false,
                windowsVerbatimArguments: true,
                env: expect.objectContaining({
                    GODOT_LAUNCHER_EDITOR_ARG_0: command,
                    GODOT_LAUNCHER_EDITOR_ARG_1: folder,
                }),
            }),
        );
        child.emit('spawn');
        expect(child.unref).not.toHaveBeenCalled();
        child.emit('exit', code);
        await expected;
    },
);

it.each([
    ['C:\\', 'C:\\\\'],
    ['C:\\My Game\\', 'C:\\My Game\\\\'],
])(
    'preserves a trailing directory separator for %s through the wrapper',
    async (folder, escaped) => {
        vi.stubGlobal('process', { ...process, platform: 'win32' });
        vi.stubEnv('SystemRoot', 'C:\\Windows');
        const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
        mocks.spawn.mockReturnValue(child);
        const launching = launchCodeEditorProcess('C:\\Tools\\code.cmd', [
            folder,
        ]);
        expect(mocks.spawn).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Array),
            expect.objectContaining({
                env: expect.objectContaining({
                    GODOT_LAUNCHER_EDITOR_ARG_1: escaped,
                }),
            }),
        );
        child.emit('exit', 0);
        await launching;
    },
);

it('dispatches Linux code editors without inherited AppImage paths', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    vi.stubEnv('APPDIR', '/tmp/.mount_launcher');
    vi.stubEnv('APPIMAGE', '/downloads/launcher.AppImage');
    vi.stubEnv('PATH', '/tmp/.mount_launcher:/usr/bin');
    vi.stubEnv('LD_LIBRARY_PATH', '/tmp/.mount_launcher/usr/lib:/opt/lib');
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const launching = launchCodeEditorProcess('/tools/code', ['/project']);
    const env = mocks.spawn.mock.lastCall?.[2].env;
    expect(env.PATH).toBe('/usr/bin');
    expect(env.LD_LIBRARY_PATH).toBe('/opt/lib');
    expect(env.APPIMAGE).toBeUndefined();
    child.emit('spawn');
    await launching;
});
