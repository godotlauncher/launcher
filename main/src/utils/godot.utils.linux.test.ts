import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    removeProjectEditorLinux,
    setProjectEditorReleaseLinux,
} from './godot.utils.linux.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    promises: {
        copyFile: vi.fn(),
        link: vi.fn(),
        symlink: vi.fn(),
        unlink: vi.fn(),
    },
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: fsMocks.promises,
    default: {
        existsSync: fsMocks.existsSync,
        promises: fsMocks.promises,
    },
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
    },
}));

describe('godot.utils.linux', () => {
    const missingRelease: InstalledRelease = {
        version: '4.6-missing',
        base_version: '4.6',
        flavor: 'gdscript',
        version_number: 4.6,
        install_path: '',
        editor_path: '',
        platform: 'linux',
        arch: 'x64',
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
        fsMocks.promises.copyFile.mockResolvedValue(undefined);
        fsMocks.promises.link.mockResolvedValue(undefined);
        fsMocks.promises.symlink.mockResolvedValue(undefined);
        fsMocks.promises.unlink.mockResolvedValue(undefined);
    });

    it('skips removing a project with no launch path', async () => {
        await removeProjectEditorLinux({
            launch_path: '',
            release: missingRelease,
        } as ProjectDetails);

        expect(fsMocks.existsSync).not.toHaveBeenCalled();
        expect(fsMocks.promises.unlink).not.toHaveBeenCalled();
    });

    it('does not unlink the project editor directory for a missing previous release', async () => {
        await setProjectEditorReleaseLinux(
            '/home/demo/Godot/Editors/.editor_config/CozyBuilder',
            {
                ...missingRelease,
                version: '4.6-stable',
                editor_path: '/opt/godot/Godot',
                valid: true,
            },
            missingRelease,
        );

        expect(fsMocks.promises.unlink).not.toHaveBeenCalled();
    });
});
