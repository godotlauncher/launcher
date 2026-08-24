/* ts-expect-error TS2304 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsStore } from './projects/projects.store.js';

const godotUtilsMocks = vi.hoisted(() => ({
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('./utils/platform.utils.js', () => ({
    getDefaultDirs: vi.fn(() => ({
        configDir: '/tmp/godot-launcher',
    })),
}));

vi.mock('./utils/godot.utils.js', () => godotUtilsMocks);

vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        getLocale: vi.fn(() => 'en'),
        isPackaged: false,
    },
}));

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
    checkProjectHealth,
    checkProjectValid,
} from './checks.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';

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
            codeEditorId: null,
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
            codeEditorId: null,
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
            codeEditorId: null,
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

    it('refreshes project icon path from project.godot', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-project-icon-'),
        );
        const releaseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-release-icon-'),
        );
        const iconPath = path.join(projectDir, 'assets', 'icon.svg');

        fs.mkdirSync(path.dirname(iconPath), { recursive: true });
        fs.writeFileSync(iconPath, '<svg></svg>');
        fs.writeFileSync(
            path.join(projectDir, 'project.godot'),
            `config_version=5

[application]
config/icon="res://assets/icon.svg"
`,
        );

        const project: ProjectDetails = {
            name: 'Icon Project',
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
            codeEditorId: null,
            withGit: false,
            valid: true,
            icon_path: 'file:///stale/icon.svg',
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.icon_path).toBe(
            `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString(
                'base64',
            )}`,
        );

        const readFile = vi.spyOn(fs.promises, 'readFile');
        await expect(checkProjectHealth(validatedProject)).resolves.toEqual(
            expect.objectContaining({ icon_path: validatedProject.icon_path }),
        );
        expect(readFile).not.toHaveBeenCalled();

        fs.writeFileSync(iconPath, '<svg>changed</svg>');
        const refreshedProject = await checkProjectHealth(validatedProject);
        expect(refreshedProject.icon_path).toBe(
            `data:image/svg+xml;base64,${Buffer.from(
                '<svg>changed</svg>',
            ).toString('base64')}`,
        );
        expect(readFile).toHaveBeenCalledWith(iconPath);
        readFile.mockRestore();

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });

    it('updates withGit from repository inspection', async () => {
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
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const gitService = {
            inspectRepository: vi.fn().mockResolvedValue({
                status: 'inside-work-tree',
                root: projectDir,
                isProjectRoot: true,
                kind: 'standard',
            }),
        };
        const validatedProject = await checkProjectValid(
            project,
            {},
            gitService as never,
        );

        expect(validatedProject.withGit).toBe(true);
        expect(gitService.inspectRepository).toHaveBeenCalledWith(projectDir);

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
            codeEditorId: null,
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

    it('preserves the persisted code editor selection during validation', async () => {
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
            codeEditorId: 'vscode',
            withGit: false,
            valid: true,
        };

        fs.writeFileSync(project.launch_path, '');
        fs.writeFileSync(project.release.editor_path, '');

        const validatedProject = await checkProjectValid(project);

        expect(validatedProject.codeEditorId).toBe('vscode');

        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(releaseDir, { recursive: true, force: true });
    });
});

describe('checkAndUpdateProjects', () => {
    it('validates and persists through the canonical store update', async () => {
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
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const update = vi.fn(async (mutator) => mutator([project]));
        const store = { update } as unknown as ProjectsStore;

        const result = await checkAndUpdateProjects({}, undefined, store);

        expect(update).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
    });
});
