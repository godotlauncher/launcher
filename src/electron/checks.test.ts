import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const releaseUtilsMocks = vi.hoisted(() => ({
    getStoredInstalledReleases: vi.fn(),
    saveStoredInstalledReleases: vi.fn(),
}));

const godotUtilsMocks = vi.hoisted(() => ({
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('./utils/releases.utils.js', () => releaseUtilsMocks);

vi.mock('./utils/platform.utils.js', () => ({
    getDefaultDirs: vi.fn(() => ({
        configDir: '/tmp/godot-launcher',
    })),
}));

vi.mock('./utils/godot.utils.js', () => godotUtilsMocks);

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import { getStoredInstalledReleases, saveStoredInstalledReleases } from './utils/releases.utils.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import { checkAndUpdateReleases, checkProjectValid } from './checks';

describe('checkAndUpdateReleases', () => {
    beforeEach(() => {
        vi.mocked(getStoredInstalledReleases).mockReset();
        vi.mocked(saveStoredInstalledReleases).mockReset();
    });

    it('marks invalid releases but keeps them stored for recovery', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-release-valid-'));
        const validEditorPath = path.join(tempDir, 'Godot');
        fs.mkdirSync(validEditorPath, { recursive: true });

        const validRelease: InstalledRelease = {
            version: '4.2.0',
            version_number: 40200,
            install_path: tempDir,
            editor_path: validEditorPath,
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: '2024-01-01T00:00:00Z',
            valid: true,
        };

        const invalidRelease: InstalledRelease = {
            version: '4.1.0',
            version_number: 40100,
            install_path: path.join(os.tmpdir(), 'launcher-missing-install'),
            editor_path: path.join(os.tmpdir(), 'launcher-missing-editor'),
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: '2023-01-01T00:00:00Z',
            valid: true,
        };

        vi.mocked(getStoredInstalledReleases).mockResolvedValueOnce([
            { ...validRelease },
            { ...invalidRelease },
        ]);
        vi.mocked(saveStoredInstalledReleases).mockImplementation(async (_, releases: InstalledRelease[]) => releases);

        const result = await checkAndUpdateReleases();

        expect(saveStoredInstalledReleases).toHaveBeenCalledTimes(1);

        const savedReleases = vi.mocked(saveStoredInstalledReleases).mock.calls[0][1] as InstalledRelease[];
        expect(savedReleases).toHaveLength(2);
        expect(savedReleases.find(r => r.version === '4.2.0')?.valid).toBe(true);
        expect(savedReleases.find(r => r.version === '4.1.0')?.valid).toBe(false);

        expect(result).toHaveLength(2);
        expect(result.find(r => r.version === '4.1.0')?.valid).toBe(false);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});

describe('checkProjectValid', () => {
    beforeEach(() => {
        vi.mocked(SetProjectEditorRelease).mockReset();
    });

    it('keeps project with invalid release and flags it accordingly', async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-project-'));
        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');

        const project: ProjectDetails = {
            name: 'Sample Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: path.join(projectDir, '.godot'),
            editor_settings_file: path.join(projectDir, '.godot', 'editor_settings-4.tres'),
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: path.join(os.tmpdir(), 'missing-install'),
                editor_path: path.join(os.tmpdir(), 'missing-editor'),
                platform: 'darwin',
                arch: 'arm64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: '2024-01-01T00:00:00Z',
                valid: true,
            },
            launch_path: path.join(projectDir, 'Godot'),
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: true,
        };

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.valid).toBe(false);
        expect(validatedProject.release.valid).toBe(false);
        expect(validatedProject.release.version).toBe('4.2.0');
        expect(SetProjectEditorRelease).not.toHaveBeenCalled();

        fs.rmSync(projectDir, { recursive: true, force: true });
    });
});
