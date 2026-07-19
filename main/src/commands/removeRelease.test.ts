import type { InstalledRelease } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    rm: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: {
        rm: fsMocks.rm,
    },
}));

const checksMocks = vi.hoisted(() => ({
    checkAndUpdateProjects: vi.fn(),
}));

vi.mock('../checks.js', () => checksMocks);

const releaseUtilsMocks = vi.hoisted(() => ({
    removeProjectEditorUsingRelease: vi.fn(),
    removeStoredInstalledRelease: vi.fn(),
}));

vi.mock('../utils/releases.utils.js', () => releaseUtilsMocks);

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
    },
}));

import { removeRelease } from './removeRelease.js';

const officialRelease: InstalledRelease = {
    version: '4.6-stable',
    version_number: 4.6,
    install_path: '/installs/4.6-stable',
    editor_path: '/installs/4.6-stable/Godot',
    platform: 'linux',
    arch: 'x64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
};

describe('removeRelease', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.rm.mockResolvedValue(undefined);
        releaseUtilsMocks.removeStoredInstalledRelease.mockResolvedValue([]);
        releaseUtilsMocks.removeProjectEditorUsingRelease.mockResolvedValue(
            undefined,
        );
        checksMocks.checkAndUpdateProjects.mockResolvedValue([]);
    });

    it('deletes launcher-managed official release files', async () => {
        await removeRelease(officialRelease);

        expect(fsMocks.rm).toHaveBeenCalledWith('/installs/4.6-stable', {
            recursive: true,
            force: true,
        });
    });

    it('unregisters custom releases without deleting their source folder', async () => {
        await removeRelease({
            ...officialRelease,
            source: 'custom',
            managed_by_launcher: false,
            install_path: '/external/custom-engine',
        });

        expect(
            releaseUtilsMocks.removeStoredInstalledRelease,
        ).toHaveBeenCalled();
        expect(
            releaseUtilsMocks.removeProjectEditorUsingRelease,
        ).toHaveBeenCalled();
        expect(fsMocks.rm).not.toHaveBeenCalled();
    });
});
