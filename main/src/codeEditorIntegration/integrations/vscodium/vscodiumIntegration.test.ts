import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorProjectContext } from '../../codeEditorIntegration.types.js';
import { VSCodiumIntegration } from './vscodiumIntegration.js';

const installationMocks = vi.hoisted(() => ({
    getVSCodiumInstallation: vi.fn(),
    resolveVSCodiumGodotConfiguration: vi.fn(),
}));

const projectConfigurationMocks = vi.hoisted(() => ({
    configureVSCodiumProject: vi.fn(),
}));

vi.mock('./vscodiumInstallation.js', () => installationMocks);
vi.mock('./vscodiumProjectConfiguration.js', () => projectConfigurationMocks);

function createContext(): CodeEditorProjectContext {
    return {
        projectPath: path.resolve('project'),
        godotLaunchPath: path.resolve('godot', 'Godot'),
        godotVersion: 4.5,
        mono: true,
        editorSettingsFile: path.resolve('editor_settings.tres'),
        editorSettingsFilename: 'editor_settings.tres',
        editorSettingsFormat: 3,
        previousCodeEditorId: 'vscode',
    };
}

describe('VSCodiumIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectConfigurationMocks.configureVSCodiumProject.mockResolvedValue(
            [],
        );
        installationMocks.resolveVSCodiumGodotConfiguration.mockImplementation(
            (execPath: string, execFlags: string) => ({ execPath, execFlags }),
        );
    });

    it('exposes stable integration metadata and defaults', () => {
        const integration = new VSCodiumIntegration();

        expect(integration.metadata).toEqual({
            id: 'vscodium',
            displayName: 'VSCodium',
            capabilities: { dotnet: true },
        });
        expect(integration.defaultSettings.execFlags).toBe(
            '{project} --goto {file}:{line}:{col}',
        );
    });

    it('detects and validates installations without automatic fallback', async () => {
        const integration = new VSCodiumIntegration();
        const executablePath = path.resolve('tools', 'VSCodium');
        installationMocks.getVSCodiumInstallation.mockResolvedValue({
            path: executablePath,
            version: '1.2.3',
        });

        await expect(
            integration.detectInstallation(executablePath),
        ).resolves.toEqual({ path: executablePath, version: '1.2.3' });
        expect(installationMocks.getVSCodiumInstallation).toHaveBeenCalledWith(
            executablePath,
        );

        await expect(integration.validatePath('   ')).resolves.toEqual({
            valid: false,
            reason: 'Path is empty.',
        });

        installationMocks.getVSCodiumInstallation.mockResolvedValueOnce(null);
        await expect(
            integration.validatePath(` ${executablePath} `),
        ).resolves.toEqual({
            valid: false,
            reason: 'Path is not a supported VSCodium installation.',
        });
    });

    it('uses the exact generic editor command and .NET fallback ID zero', () => {
        const integration = new VSCodiumIntegration();
        const executablePath = path.resolve('tools', 'codium');

        expect(
            integration.resolveGodotConfiguration({
                installation: { path: executablePath, version: null },
                settings: { execFlagsOverride: '--custom {file}' },
                godotFlavor: 'dotnet',
                godotVersion: 4,
            }),
        ).toEqual({
            textEditor: {
                execPath: executablePath,
                execFlags: '--custom {file}',
            },
            dotnet: { externalEditorId: 0 },
        });
        expect(
            installationMocks.resolveVSCodiumGodotConfiguration,
        ).toHaveBeenCalledWith(executablePath, '--custom {file}');
    });

    it('configures VSCodium project files without claiming legacy .vscode inference', async () => {
        const integration = new VSCodiumIntegration();
        const context = createContext();
        projectConfigurationMocks.configureVSCodiumProject.mockResolvedValue([
            path.resolve('settings.bad'),
        ]);

        await expect(
            integration.isConfiguredForProject('project'),
        ).resolves.toBe(false);
        await expect(integration.configureProject(context)).resolves.toEqual({
            recoveredConfigFiles: [path.resolve('settings.bad')],
        });
        expect(
            projectConfigurationMocks.configureVSCodiumProject,
        ).toHaveBeenCalledWith(
            context.projectPath,
            context.godotLaunchPath,
            context.godotVersion,
            true,
            'vscode',
        );
    });
});
