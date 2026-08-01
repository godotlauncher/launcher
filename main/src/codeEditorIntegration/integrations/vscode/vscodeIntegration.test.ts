import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorProjectContext } from '../../codeEditorIntegration.types.js';
import { VSCodeIntegration } from './vscodeIntegration.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    default: { existsSync: fsMocks.existsSync },
}));

const vscodeMocks = vi.hoisted(() => ({
    addOrUpdateVSCodeRecommendedExtensions: vi.fn(),
    addVSCodeSettings: vi.fn(),
    getVSCodeInstallPath: vi.fn(),
    updateVSCodeSettings: vi.fn(),
}));

vi.mock('./vscodeIntegration.utils.js', () => vscodeMocks);

function createContext(
    overrides: Partial<CodeEditorProjectContext> = {},
): CodeEditorProjectContext {
    return {
        projectPath: path.resolve('project'),
        godotLaunchPath: path.resolve('godot', 'Godot'),
        godotVersion: 4.3,
        mono: false,
        editorSettingsFile: path.resolve('editor_settings.tres'),
        editorSettingsFilename: 'editor_settings.tres',
        editorSettingsFormat: 3,
        configurationMode: 'create',
        ...overrides,
    };
}

describe('VSCodeIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(false);
        vscodeMocks.addVSCodeSettings.mockResolvedValue([]);
        vscodeMocks.updateVSCodeSettings.mockResolvedValue([]);
        vscodeMocks.addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(
            [],
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects installations and validates explicit paths independently', async () => {
        const integration = new VSCodeIntegration();
        const candidatePath = path.resolve('tools', 'code');
        vscodeMocks.getVSCodeInstallPath.mockResolvedValue(candidatePath);

        await expect(
            integration.detectInstallation(candidatePath),
        ).resolves.toEqual({
            path: candidatePath,
            version: null,
        });

        await expect(integration.validatePath('')).resolves.toEqual({
            valid: false,
            reason: 'Path is empty.',
        });
        await expect(integration.validatePath(candidatePath)).resolves.toEqual({
            valid: false,
            reason: 'Path does not exist.',
        });

        fsMocks.existsSync.mockReturnValue(true);
        vscodeMocks.getVSCodeInstallPath.mockResolvedValueOnce(null);
        await expect(integration.validatePath(candidatePath)).resolves.toEqual({
            valid: false,
            reason: 'Path is not a supported Visual Studio Code installation.',
        });

        vscodeMocks.getVSCodeInstallPath.mockResolvedValueOnce(candidatePath);
        await expect(
            integration.validatePath(` ${candidatePath} `),
        ).resolves.toEqual({
            valid: true,
            installation: {
                path: candidatePath,
                version: null,
            },
        });
    });

    it('configures VS Code-owned project files through existing utilities', async () => {
        const integration = new VSCodeIntegration();
        const context = createContext();
        vscodeMocks.addVSCodeSettings.mockResolvedValue([
            path.resolve('settings.bad'),
        ]);
        vscodeMocks.addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue([
            path.resolve('extensions.bad'),
        ]);

        await expect(integration.configureProject(context)).resolves.toEqual({
            recoveredConfigFiles: [
                path.resolve('settings.bad'),
                path.resolve('extensions.bad'),
            ],
        });
        expect(vscodeMocks.addVSCodeSettings).toHaveBeenCalledWith(
            context.projectPath,
            context.godotLaunchPath,
            context.godotVersion,
            context.mono,
        );
        expect(vscodeMocks.updateVSCodeSettings).not.toHaveBeenCalled();
        expect(
            vscodeMocks.addOrUpdateVSCodeRecommendedExtensions,
        ).toHaveBeenCalledWith(context.projectPath, context.mono);
    });

    it('updates VS Code-owned project files in update mode', async () => {
        const integration = new VSCodeIntegration();
        const context = createContext({
            configurationMode: 'update',
            mono: true,
        });
        vscodeMocks.updateVSCodeSettings.mockResolvedValue([
            path.resolve('settings.bad'),
        ]);
        vscodeMocks.addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue([
            path.resolve('extensions.bad'),
        ]);

        await expect(integration.configureProject(context)).resolves.toEqual({
            recoveredConfigFiles: [
                path.resolve('settings.bad'),
                path.resolve('extensions.bad'),
            ],
        });
        expect(vscodeMocks.updateVSCodeSettings).toHaveBeenCalledWith(
            context.projectPath,
            context.godotLaunchPath,
            context.godotVersion,
            context.mono,
        );
        expect(vscodeMocks.addVSCodeSettings).not.toHaveBeenCalled();
        expect(
            vscodeMocks.addOrUpdateVSCodeRecommendedExtensions,
        ).toHaveBeenCalledWith(context.projectPath, context.mono);
    });

    it.each([
        true,
        false,
    ])('reports project configuration as %s from the .vscode directory', async (configured) => {
        const integration = new VSCodeIntegration();
        const projectPath = path.resolve('project');
        fsMocks.existsSync.mockReturnValue(configured);

        await expect(
            integration.isConfiguredForProject(projectPath),
        ).resolves.toBe(configured);
        expect(fsMocks.existsSync).toHaveBeenCalledWith(
            path.resolve(projectPath, '.vscode'),
        );
    });

    it('passes non-macOS executables through with Godot command flags', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const integration = new VSCodeIntegration();
        const executablePath = path.resolve('tools', 'code.exe');

        expect(
            integration.resolveGodotConfiguration({
                installation: {
                    path: executablePath,
                    version: null,
                },
                settings: { execFlagsOverride: null },
                godotFlavor: 'standard',
                godotVersion: 4.3,
            }),
        ).toEqual({
            textEditor: {
                execPath: executablePath,
                execFlags: '{project} --goto {file}:{line}:{col}',
            },
        });
    });

    it('uses the VS Code command script for Godot on Windows when available', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        fsMocks.existsSync.mockReturnValue(true);
        const integration = new VSCodeIntegration();
        const executablePath = path.resolve('tools', 'Code.exe');

        expect(
            integration.resolveGodotConfiguration({
                installation: {
                    path: executablePath,
                    version: null,
                },
                settings: { execFlagsOverride: null },
                godotFlavor: 'standard',
                godotVersion: 4.3,
            }),
        ).toEqual({
            textEditor: {
                execPath: path.resolve('tools', 'bin', 'code.cmd'),
                execFlags: '{project} --goto {file}:{line}:{col}',
            },
        });
        expect(fsMocks.existsSync).toHaveBeenCalledWith(
            path.resolve('tools', 'bin', 'code.cmd'),
        );
    });
    it('normalizes macOS app bundles for Godot', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        const integration = new VSCodeIntegration();

        expect(
            integration.resolveGodotConfiguration({
                installation: {
                    path: '/Applications/Visual Studio Code.app',
                    version: null,
                },
                settings: { execFlagsOverride: '--custom {file}' },
                godotFlavor: 'dotnet',
                godotVersion: 4.3,
            }),
        ).toEqual({
            textEditor: {
                execPath: path.resolve(
                    '/Applications/Visual Studio Code.app',
                    'Contents',
                    'MacOS',
                    'Electron',
                ),
                execFlags: '--custom {file}',
            },
            dotnet: {
                externalEditorId: 4,
            },
        });
    });

    it('uses a manually selected macOS executable directly', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        const integration = new VSCodeIntegration();
        const executablePath =
            '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';

        expect(
            integration.resolveGodotConfiguration({
                installation: {
                    path: executablePath,
                    version: null,
                },
                settings: { execFlagsOverride: null },
                godotFlavor: 'standard',
                godotVersion: 4.3,
            }),
        ).toEqual({
            textEditor: {
                execPath: executablePath,
                execFlags: '{project} --goto {file}:{line}:{col}',
            },
        });
    });
});
