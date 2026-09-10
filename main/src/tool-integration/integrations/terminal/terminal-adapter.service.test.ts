import { EventEmitter } from 'node:events';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTarget } from './terminal.types.js';
import { TerminalAdapterService } from './terminal-adapter.service.js';

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs/promises', () => ({ access: mocks.access, stat: mocks.stat }));

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
];

describe('TerminalAdapterService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.access.mockResolvedValue(undefined);
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
            else if (target.id === 'gnome-terminal')
                expect(args).toEqual(['--working-directory', directory]);
            else if (target.id === 'konsole')
                expect(args).toEqual(['--separate', '--workdir', '.']);
            else {
                expect(args).toEqual([]);
                expect(options).toMatchObject({
                    windowsHide: false,
                    detached: true,
                });
            }
            expect(child.unref).toHaveBeenCalledTimes(
                target.id === 'konsole' || target.id === 'command-prompt'
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
