import { EventEmitter } from 'node:events';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTarget } from './terminal.types.js';
import { TerminalAdapterService } from './terminal-adapter.service.js';

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
    lstat: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs/promises', () => ({
    access: mocks.access,
    stat: mocks.stat,
    lstat: mocks.lstat,
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

const newLinuxTargets: TerminalTarget[] = [
    'foot',
    'alacritty',
    'ghostty',
    'kitty',
].map((id) => ({
    id: id as TerminalTarget['id'],
    displayName: id,
    executablePath: `/usr/bin/${id}`,
}));

const targets: TerminalTarget[] = [
    {
        id: 'macos-terminal',
        displayName: 'Terminal.app',
        executablePath: '/System/Applications/Utilities/Terminal.app',
    },
    {
        id: 'windows-terminal',
        displayName: 'Windows Terminal',
        executablePath: 'C:\\WindowsApps\\wt.exe',
    },
    {
        id: 'command-prompt',
        displayName: 'Command Prompt',
        executablePath: 'C:\\Windows\\System32\\cmd.exe',
    },
    {
        id: 'gnome-terminal',
        displayName: 'GNOME Terminal',
        executablePath: '/usr/bin/gnome-terminal',
    },
    {
        id: 'konsole',
        displayName: 'Konsole',
        executablePath: '/usr/bin/konsole',
    },
    ...newLinuxTargets,
];

describe('TerminalAdapterService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mocks.access.mockResolvedValue(undefined);
        mocks.lstat.mockResolvedValue({
            isFile: () => false,
            isSymbolicLink: () => true,
        });
        mocks.stat.mockResolvedValue({
            isFile: () => true,
            isDirectory: () => true,
        });
    });

    it('discovers Windows Terminal before the system Command Prompt without using PATH', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\fixture\\AppData\\Local');
        vi.stubEnv('SystemRoot', 'C:\\Windows');
        vi.stubEnv('PATH', 'C:\\untrusted-project');
        const candidates = await new TerminalAdapterService().discover();
        expect(candidates.map((target) => target.id)).toEqual([
            'windows-terminal',
            'command-prompt',
        ]);
        expect(candidates[1].executablePath).toBe(
            'C:\\Windows\\System32\\cmd.exe',
        );
        expect(mocks.spawn).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('discovers additional Linux terminals from system locations, skipping missing executables', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        mocks.access.mockImplementation(async (executable: string) => {
            if (
                ![
                    '/usr/bin/foot',
                    '/bin/alacritty',
                    '/usr/bin/ghostty',
                    '/usr/bin/kitty',
                ].includes(executable)
            )
                throw new Error('ENOENT');
        });
        try {
            const candidates = await new TerminalAdapterService().discover();
            expect(
                candidates.map(({ id, executablePath }) => ({
                    id,
                    executablePath,
                })),
            ).toEqual([
                { id: 'foot', executablePath: '/usr/bin/foot' },
                { id: 'alacritty', executablePath: '/bin/alacritty' },
                { id: 'ghostty', executablePath: '/usr/bin/ghostty' },
                { id: 'kitty', executablePath: '/usr/bin/kitty' },
            ]);
            expect(mocks.spawn).not.toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
        }
    });

    it.each(targets)(
        'passes the directory as data for $id and acknowledges the appropriate lifetime',
        async (target) => {
            const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
            mocks.spawn.mockImplementation(() => {
                queueMicrotask(() => {
                    child.emit('spawn');
                    child.emit('exit', 0);
                });
                return child;
            });
            const directory = path.resolve(
                'projects',
                '- space é ; $HOME ` quote\' double"',
            );
            await expect(
                new TerminalAdapterService().launch(target, directory),
            ).resolves.toEqual({ success: true });
            const [executable, args, options] = mocks.spawn.mock.calls[0];
            expect(options).toMatchObject({
                cwd: directory,
                shell: false,
                stdio: 'ignore',
            });
            if (target.id === 'macos-terminal') {
                expect(executable).toBe('/usr/bin/open');
                expect(args).toEqual(['-a', target.executablePath, directory]);
            } else if (target.id === 'windows-terminal')
                expect(args).toEqual(['-d', '.']);
            else if (
                ['gnome-terminal', 'foot', 'alacritty'].includes(target.id)
            )
                expect(args).toEqual(['--working-directory', directory]);
            else if (target.id === 'konsole')
                expect(args).toEqual(['--separate', '--workdir', '.']);
            else if (target.id === 'ghostty')
                expect(args).toEqual([
                    '--gtk-single-instance=false',
                    `--working-directory=${directory}`,
                ]);
            else if (target.id === 'kitty')
                expect(args).toEqual(['--directory', directory]);
            else {
                expect(args).toEqual([
                    '/d',
                    '/c',
                    `start "" "${target.executablePath}" /d`,
                ]);
                expect(options).toMatchObject({
                    windowsHide: true,
                    detached: false,
                    windowsVerbatimArguments: true,
                });
            }
            expect(child.unref).toHaveBeenCalledTimes(
                ![
                    'macos-terminal',
                    'windows-terminal',
                    'command-prompt',
                    'gnome-terminal',
                ].includes(target.id)
                    ? 1
                    : 0,
            );
        },
    );

    it('rejects CMD UNC directories without spawning', async () => {
        await expect(
            new TerminalAdapterService().launch(
                targets[2],
                '\\\\server\\share\\project',
            ),
        ).resolves.toEqual({ success: false, reason: 'unsupported-directory' });
        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it('rejects a disappeared directory before dispatch', async () => {
        mocks.stat
            .mockResolvedValueOnce({ isFile: () => true })
            .mockRejectedValueOnce(new Error('ENOENT'));
        await expect(
            new TerminalAdapterService().launch(
                targets[0],
                path.resolve('gone'),
            ),
        ).resolves.toEqual({ success: false, reason: 'missing-directory' });
        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it('reports dispatcher failure without retrying another application', async () => {
        const child = new EventEmitter();
        mocks.spawn.mockImplementation(() => {
            queueMicrotask(() => child.emit('exit', 1));
            return child;
        });
        await expect(
            new TerminalAdapterService().launch(
                targets[0],
                path.resolve('project'),
            ),
        ).resolves.toEqual({ success: false, reason: 'launch-failed' });
        expect(mocks.spawn).toHaveBeenCalledOnce();
    });

    it('reports asynchronous spawn failure for a detached host', async () => {
        const child = new EventEmitter();
        mocks.spawn.mockImplementation(() => {
            queueMicrotask(() => child.emit('error', new Error('ENOENT')));
            return child;
        });
        await expect(
            new TerminalAdapterService().launch(
                targets[4],
                path.resolve('project'),
            ),
        ).resolves.toEqual({ success: false, reason: 'launch-failed' });
    });
});
