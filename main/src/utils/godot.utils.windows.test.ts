import * as path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    removeProjectEditorWindows,
    removeProjectReleaseEditorWindows,
} from './godot.utils.windows.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    promises: {
        rm: vi.fn(),
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
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../commands/userPreferences.js', () => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('../pathResolver.js', () => ({
    getAssetPath: vi.fn(() => '/assets'),
}));

describe('godot.utils.windows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.promises.rm.mockResolvedValue(undefined);
    });

    it('skips removing a previous missing editor release', async () => {
        const release: InstalledRelease = {
            version: '4.6-missing',
            base_version: '4.6',
            flavor: 'gdscript',
            version_number: 4.6,
            install_path: '',
            editor_path: '',
            platform: 'win32',
            arch: 'x64',
            mono: false,
            prerelease: true,
            config_version: 5,
            published_at: null,
            valid: false,
            source: 'custom',
        };

        await removeProjectReleaseEditorWindows(
            'G:\\Godot\\GD_LAUNCHER\\Editors\\.editor_config\\CozyBuilder',
            release,
        );

        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
    });

    it('skips removing a project with a missing editor release', async () => {
        const release: InstalledRelease = {
            version: '4.6-missing',
            base_version: '4.6',
            flavor: 'gdscript',
            version_number: 4.6,
            install_path: '',
            editor_path: '',
            platform: 'win32',
            arch: 'x64',
            mono: false,
            prerelease: true,
            config_version: 5,
            published_at: null,
            valid: false,
            source: 'custom',
        };

        await removeProjectEditorWindows({
            launch_path: '',
            release,
        } as ProjectDetails);

        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
    });

    it('removes dangling editor, console and .NET targets after installation deletion', async () => {
        const projectEditorPath = path.resolve('editor-config', 'CozyBuilder');
        fsMocks.existsSync.mockImplementation(
            (target) => target === projectEditorPath,
        );
        const release = {
            editor_path: path.resolve('managed-install', 'Godot.exe'),
            mono: true,
        } as InstalledRelease;

        await removeProjectReleaseEditorWindows(projectEditorPath, release);

        expect(fsMocks.promises.rm).toHaveBeenCalledWith(
            path.join(projectEditorPath, 'Godot.exe'),
            { force: true },
        );
        expect(fsMocks.promises.rm).toHaveBeenCalledWith(
            path.join(projectEditorPath, 'Godot_console.exe'),
            { force: true },
        );
        expect(fsMocks.promises.rm).toHaveBeenCalledWith(
            path.join(projectEditorPath, 'GodotSharp'),
            { recursive: true, force: true },
        );
    });
});
