/* ts-expect-error TS2304 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const releaseUtilsMocks = vi.hoisted(() => ({
    getStoredInstalledReleases: vi.fn(),
    saveStoredInstalledReleases: vi.fn(),
}));

const godotUtilsMocks = vi.hoisted(() => ({
    SetProjectEditorRelease: vi.fn(),
}));

const projectsUtilsMocks = vi.hoisted(() => ({
    getProjectsSnapshot: vi.fn(),
    storeProjectsList: vi.fn(),
}));

vi.mock('./utils/releases.utils.js', async () => {
    const actual = await vi.importActual<
        typeof import('./utils/releases.utils.js')
    >('./utils/releases.utils.js');
    return {
        ...actual,
        ...releaseUtilsMocks,
    };
});

vi.mock('./utils/platform.utils.js', () => ({
    getDefaultDirs: vi.fn(() => ({
        configDir: '/tmp/godot-launcher',
    })),
}));

vi.mock('./utils/godot.utils.js', () => godotUtilsMocks);

vi.mock('./utils/projects.utils.js', () => projectsUtilsMocks);

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import {
    checkAndUpdateProjects,
    checkAndUpdateReleases,
    checkProjectValid,
} from './checks.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import { JsonStoreConflictError } from './utils/jsonStore.js';
import {
    getStoredInstalledReleases,
    saveStoredInstalledReleases,
} from './utils/releases.utils.js';

const { getProjectsSnapshot, storeProjectsList } = projectsUtilsMocks;

describe('checkAndUpdateReleases', () => {
    beforeEach(() => {
        vi.mocked(getStoredInstalledReleases).mockReset();
        vi.mocked(saveStoredInstalledReleases).mockReset();
    });

    it('marks invalid releases but keeps them stored for recovery', async () => {
        const tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-valid-'),
        );
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
        vi.mocked(saveStoredInstalledReleases).mockImplementation(
            async (releases: InstalledRelease[]) => releases,
        );

        const result = await checkAndUpdateReleases();

        expect(saveStoredInstalledReleases).toHaveBeenCalledTimes(1);

        const savedReleases = vi.mocked(saveStoredInstalledReleases).mock
            .calls[0][0] as InstalledRelease[];
        expect(savedReleases).toHaveLength(2);
        expect(savedReleases.find((r) => r.version === '4.2.0')?.valid).toBe(
            true,
        );
        expect(savedReleases.find((r) => r.version === '4.1.0')?.valid).toBe(
            false,
        );

        expect(result).toHaveLength(2);
        expect(result.find((r) => r.version === '4.1.0')?.valid).toBe(false);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('dedupes releases by version and mono after validation', async () => {
        const tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-dedupe-'),
        );
        const validEditorPath = path.join(tempDir, 'Godot');
        fs.mkdirSync(validEditorPath, { recursive: true });

        const invalidRelease: InstalledRelease = {
            version: '4.2.0',
            version_number: 40200,
            install_path: path.join(os.tmpdir(), 'launcher-old-install'),
            editor_path: path.join(os.tmpdir(), 'launcher-old-editor'),
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: '2024-01-01T00:00:00Z',
            valid: true,
        };
        const validRelease: InstalledRelease = {
            ...invalidRelease,
            install_path: tempDir,
            editor_path: validEditorPath,
        };
        const dotNetRelease: InstalledRelease = {
            ...validRelease,
            mono: true,
            install_path: path.join(tempDir, 'mono'),
            editor_path: path.join(tempDir, 'Godot_mono'),
        };
        fs.mkdirSync(dotNetRelease.editor_path, { recursive: true });

        vi.mocked(getStoredInstalledReleases).mockResolvedValueOnce([
            invalidRelease,
            validRelease,
            dotNetRelease,
        ]);
        vi.mocked(saveStoredInstalledReleases).mockImplementation(
            async (releases: InstalledRelease[]) => releases,
        );

        const result = await checkAndUpdateReleases();

        expect(result).toHaveLength(2);
        expect(
            result.find((r) => r.version === '4.2.0' && !r.mono)?.editor_path,
        ).toBe(validEditorPath);
        expect(
            result.find((r) => r.version === '4.2.0' && r.mono),
        ).toBeDefined();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});

describe('checkProjectValid', () => {
    beforeEach(() => {
        vi.mocked(SetProjectEditorRelease).mockReset();
    });

    it('keeps project with invalid release and flags it accordingly', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-'),
        );
        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');

        const project: ProjectDetails = {
            name: 'Sample Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: path.join(projectDir, '.godot'),
            editor_settings_file: path.join(
                projectDir,
                '.godot',
                'editor_settings-4.tres',
            ),
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
        expect(validatedProject.invalid_reason).toBe('missing_editor');
        expect(validatedProject.release.version).toBe('4.2.0');
        expect(SetProjectEditorRelease).not.toHaveBeenCalled();

        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('flags missing project file separately from a valid editor', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-missing-file-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-valid-'),
        );

        const project: ProjectDetails = {
            name: 'Missing File Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: releaseDir,
                editor_path: path.join(releaseDir, 'Godot.exe'),
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: path.join(projectDir, 'Godot.exe'),
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.valid).toBe(false);
        expect(validatedProject.release.valid).toBe(true);
        expect(validatedProject.invalid_reason).toBe('missing_project_file');

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });

    it('clears stale invalid reason when project and editor are valid', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-valid-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-valid-'),
        );

        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');

        const project: ProjectDetails = {
            name: 'Recovered Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: releaseDir,
                editor_path: path.join(releaseDir, 'Godot.exe'),
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: false,
            },
            launch_path: path.join(projectDir, 'Godot.exe'),
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: false,
            invalid_reason: 'missing_editor',
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.valid).toBe(true);
        expect(validatedProject.release.valid).toBe(true);
        expect(validatedProject.invalid_reason).toBeUndefined();

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });

    it('updates withGit flag based on .git directory presence', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-git-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-'),
        );

        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');
        fs.mkdirSync(path.join(projectDir, '.git'));

        const project: ProjectDetails = {
            name: 'Git Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: releaseDir,
                editor_path: path.join(releaseDir, 'Godot.exe'),
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: path.join(projectDir, 'Godot.exe'),
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.withGit).toBe(true);

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });

    it('does not repair missing launch path when passive validation disables repair', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-passive-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-passive-'),
        );

        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');

        const project: ProjectDetails = {
            name: 'Passive Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: releaseDir,
                editor_path: path.join(releaseDir, 'Godot.exe'),
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: path.join(projectDir, 'missing-Godot.exe'),
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project, {
            repairMissingLaunchPath: false,
        });

        expect(validatedProject.valid).toBe(true);
        expect(validatedProject.release.valid).toBe(true);
        expect(SetProjectEditorRelease).not.toHaveBeenCalled();

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });

    it('disables VSCode flag when external editor setting is not enabled', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-vscode-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-'),
        );

        fs.writeFileSync(path.join(projectDir, 'project.godot'), '');
        fs.mkdirSync(path.join(projectDir, '.vscode'));

        const editorDataDir = path.join(projectDir, 'editor_data');
        fs.mkdirSync(editorDataDir);

        const editorSettingsPath = path.join(
            editorDataDir,
            'editor_settings-4.2.tres',
        );
        fs.writeFileSync(
            editorSettingsPath,
            `
[resource]
text_editor/external/use_external_editor = false
`,
        );

        const project: ProjectDetails = {
            name: 'VSCode Project',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            path: projectDir,
            editor_settings_path: editorDataDir,
            editor_settings_file: editorSettingsPath,
            last_opened: null,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: releaseDir,
                editor_path: path.join(releaseDir, 'Godot.exe'),
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: path.join(projectDir, 'Godot.exe'),
            config_version: 5,
            withVSCode: true,
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.withVSCode).toBe(false);

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });
});

describe('checkAndUpdateProjects', () => {
    beforeEach(() => {
        vi.mocked(getProjectsSnapshot).mockReset();
        vi.mocked(storeProjectsList).mockReset();
    });

    it('retries when project snapshot becomes stale during validation', async () => {
        const project: ProjectDetails = {
            name: 'Sample',
            path: '/projects/sample',
            version: '4.2.0',
            version_number: 40200,
            renderer: 'forward_plus',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2.0',
                version_number: 40200,
                install_path: '/godot',
                editor_path: '/godot/Godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/Godot.exe',
            config_version: 5,
            withVSCode: false,
            withGit: false,
            valid: true,
        };

        vi.mocked(getProjectsSnapshot)
            .mockResolvedValueOnce({ projects: [project], version: 'v1' })
            .mockResolvedValueOnce({ projects: [project], version: 'v2' });

        vi.mocked(storeProjectsList)
            .mockRejectedValueOnce(
                new JsonStoreConflictError('/tmp/godot-launcher/projects.json'),
            )
            .mockResolvedValue([{ ...project, valid: true }]);

        const result = await checkAndUpdateProjects();

        // The important behaviour here is that the call retries and the
        // updated project list is persisted; we assert that happened and the
        // resulting project is marked valid.
        expect(storeProjectsList).toHaveBeenCalledTimes(2);
        expect(result[0].valid).toBe(true);
    });
});
