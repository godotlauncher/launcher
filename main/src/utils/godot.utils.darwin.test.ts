import type { InstalledRelease, ProjectDetails } from '@shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    removeProjectEditorDarwin,
    setProjectEditorReleaseDarwin,
} from './godot.utils.darwin.js';

const fsMocks = vi.hoisted(() => ({
    constants: {
        COPYFILE_FICLONE: 1,
    },
    existsSync: vi.fn(),
    promises: {
        cp: vi.fn(),
        lstat: vi.fn(),
        rm: vi.fn(),
        unlink: vi.fn(),
    },
}));

vi.mock('node:fs', () => ({
    constants: fsMocks.constants,
    existsSync: fsMocks.existsSync,
    promises: fsMocks.promises,
    default: {
        constants: fsMocks.constants,
        existsSync: fsMocks.existsSync,
        promises: fsMocks.promises,
    },
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
    },
}));

describe('godot.utils.darwin', () => {
    const missingRelease: InstalledRelease = {
        version: '4.6-missing',
        base_version: '4.6',
        flavor: 'gdscript',
        version_number: 4.6,
        install_path: '',
        editor_path: '',
        platform: 'darwin',
        arch: 'arm64',
        mono: false,
        prerelease: true,
        config_version: 5,
        published_at: null,
        valid: false,
        source: 'custom',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(false);
        fsMocks.promises.cp.mockResolvedValue(undefined);
        fsMocks.promises.lstat.mockResolvedValue({
            isSymbolicLink: () => false,
        });
        fsMocks.promises.rm.mockResolvedValue(undefined);
        fsMocks.promises.unlink.mockResolvedValue(undefined);
    });

    it('skips removing a project with no launch path', async () => {
        await removeProjectEditorDarwin({
            launch_path: '',
            release: missingRelease,
        } as ProjectDetails);

        expect(fsMocks.promises.lstat).not.toHaveBeenCalled();
    });

    it('does not remove the project editor directory for a missing previous release', async () => {
        await setProjectEditorReleaseDarwin(
            '/Users/demo/Godot/Editors/.editor_config/CozyBuilder',
            {
                ...missingRelease,
                version: '4.6-stable',
                editor_path: '/Applications/Godot.app',
                valid: true,
            },
            missingRelease,
        );

        expect(fsMocks.promises.lstat).not.toHaveBeenCalled();
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(fsMocks.promises.unlink).not.toHaveBeenCalled();
    });
});
