import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
    lstat: vi.fn(),
}));

vi.mock('node:fs', () => ({
    promises: {
        lstat: fsMocks.lstat,
    },
}));

import { resolveWindowsGitAskPassExecutable } from './git-askpass-executable.util.js';

describe('resolveWindowsGitAskPassExecutable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.lstat.mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => false,
        });
    });

    it('resolves the packaged helper from external resources', async () => {
        const result = await resolveWindowsGitAskPassExecutable({
            architecture: 'x64',
            isPackaged: true,
            appPath: path.resolve('app'),
            resourcesPath: path.resolve('resources'),
        });

        expect(result).toBe(
            path.resolve(
                'resources',
                'git-credentials-helper',
                'godot-launcher-git-askpass.exe',
            ),
        );
        expect(fsMocks.lstat).toHaveBeenCalledWith(result);
    });

    it('resolves the architecture-matched development output', async () => {
        const result = await resolveWindowsGitAskPassExecutable({
            architecture: 'arm64',
            isPackaged: false,
            appPath: path.resolve('launcher'),
            resourcesPath: path.resolve('resources'),
        });

        expect(result).toBe(
            path.resolve(
                'launcher',
                'native',
                'git-credentials-helper',
                'windows-askpass',
                'out',
                'win32-arm64',
                'godot-launcher-git-askpass.exe',
            ),
        );
    });

    it('rejects symlinks and non-files', async () => {
        fsMocks.lstat.mockResolvedValue({
            isFile: () => false,
            isSymbolicLink: () => true,
        });

        await expect(
            resolveWindowsGitAskPassExecutable({
                architecture: 'x64',
                isPackaged: true,
                appPath: '',
                resourcesPath: path.resolve('resources'),
            }),
        ).rejects.toThrow('not a regular file');
    });

    it('rejects unsupported architectures before reading the file', async () => {
        await expect(
            resolveWindowsGitAskPassExecutable({
                architecture: 'ia32',
                isPackaged: false,
                appPath: path.resolve('launcher'),
                resourcesPath: '',
            }),
        ).rejects.toThrow('Unsupported Windows askpass architecture');
        expect(fsMocks.lstat).not.toHaveBeenCalled();
    });
});
