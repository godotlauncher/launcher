import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_DIR_NAME } from '../constants.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import type {
    CodeEditorIntegration,
    CodeEditorProjectContext,
} from './codeEditorIntegration.types.js';

const CODE_EDITOR_ID = 'vscode' as const;

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    default: { existsSync: fsMocks.existsSync },
}));

const pathResolverMocks = vi.hoisted(() => ({
    getAssetPath: vi.fn(() => path.resolve('assets')),
}));

vi.mock('../pathResolver.js', () => pathResolverMocks);

const godotProjectMocks = vi.hoisted(() => ({
    createNewEditorSettings: vi.fn(),
    updateEditorSettings: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

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
        configurationMode: 'update',
        ...overrides,
    };
}

function createIntegration(): CodeEditorIntegration {
    return {
        metadata: {
            id: CODE_EDITOR_ID,
            displayName: 'Visual Studio Code',
        },
        detectInstallation: vi.fn().mockResolvedValue({
            path: path.resolve('tools', 'code'),
            version: null,
        }),
        validatePath: vi.fn().mockResolvedValue({
            valid: true,
            installation: {
                path: path.resolve('tools', 'code'),
                version: null,
            },
        }),
        isConfiguredForProject: vi.fn().mockResolvedValue(true),
        getGodotLaunchConfiguration: vi.fn().mockReturnValue({
            execPath: path.resolve('tools', 'code'),
            execFlags: '{project} --goto {file}:{line}:{col}',
        }),
        configureProject: vi.fn().mockResolvedValue({
            recoveredConfigFiles: [],
        }),
    };
}

function createService(integration: CodeEditorIntegration) {
    return new CodeEditorIntegrationService(
        new CodeEditorIntegrationRegistry([integration]),
    );
}

describe('CodeEditorIntegrationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(false);
        godotProjectMocks.createNewEditorSettings.mockResolvedValue(
            path.resolve('godot', 'editor_data', 'created.tres'),
        );
    });

    it('returns serializable integration and installation summaries', async () => {
        const integration = createIntegration();
        const service = createService(integration);

        expect(service.listIntegrations()).toEqual([integration.metadata]);
        await expect(service.scanIntegration(CODE_EDITOR_ID)).resolves.toEqual({
            integrationId: CODE_EDITOR_ID,
            path: path.resolve('tools', 'code'),
            version: null,
        });
        await expect(service.scanIntegrations()).resolves.toEqual([
            {
                integrationId: CODE_EDITOR_ID,
                path: path.resolve('tools', 'code'),
                version: null,
            },
        ]);
    });

    it('validates paths through the selected integration', async () => {
        const integration = createIntegration();
        const service = createService(integration);
        const candidatePath = path.resolve('tools', 'code');

        await expect(
            service.validateIntegrationPath(CODE_EDITOR_ID, candidatePath),
        ).resolves.toEqual({
            valid: true,
            installation: {
                integrationId: CODE_EDITOR_ID,
                path: candidatePath,
                version: null,
            },
        });
        expect(integration.validatePath).toHaveBeenCalledWith(candidatePath);
    });

    it('applies a detected integration and updates existing Godot settings', async () => {
        const projectPath = path.resolve('project');
        const recoveredFile = path.resolve(
            projectPath,
            '.vscode',
            'settings.json.bad',
        );
        const integration = createIntegration();
        vi.mocked(integration.configureProject).mockResolvedValue({
            recoveredConfigFiles: [recoveredFile, recoveredFile],
        });
        const service = createService(integration);
        const context = createContext({ projectPath });
        fsMocks.existsSync.mockReturnValue(true);

        await expect(
            service.applyToProject(
                CODE_EDITOR_ID,
                context,
                path.resolve('custom', 'code'),
            ),
        ).resolves.toEqual({
            editorSettingsFile: context.editorSettingsFile,
            recoveredConfigFiles: ['.vscode/settings.json.bad'],
        });
        expect(integration.detectInstallation).toHaveBeenCalledWith(
            path.resolve('custom', 'code'),
        );
        expect(integration.configureProject).toHaveBeenCalledWith(context);
        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            context.editorSettingsFile,
            {
                execPath: path.resolve('tools', 'code'),
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: false,
            },
        );
    });

    it('creates Godot settings when an existing file is unavailable', async () => {
        const integration = createIntegration();
        const service = createService(integration);
        const context = createContext({
            editorSettingsFile: '',
            configurationMode: 'create',
        });

        await expect(
            service.applyToProject(CODE_EDITOR_ID, context),
        ).resolves.toEqual({
            editorSettingsFile: path.resolve(
                'godot',
                'editor_data',
                'created.tres',
            ),
            recoveredConfigFiles: [],
        });
        expect(godotProjectMocks.createNewEditorSettings).toHaveBeenCalledWith(
            path.resolve(path.resolve('assets'), TEMPLATE_DIR_NAME),
            context.godotLaunchPath,
            context.editorSettingsFilename,
            context.editorSettingsFormat,
            true,
            path.resolve('tools', 'code'),
            '{project} --goto {file}:{line}:{col}',
            false,
        );
    });

    it('does not configure a project when the integration is unavailable', async () => {
        const integration = createIntegration();
        vi.mocked(integration.detectInstallation).mockResolvedValue(null);
        const service = createService(integration);

        await expect(
            service.applyToProject(CODE_EDITOR_ID, createContext()),
        ).rejects.toThrow('Visual Studio Code installation was not found.');
        expect(integration.configureProject).not.toHaveBeenCalled();
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });

    it('disables the external editor in existing Godot settings', async () => {
        const service = createService(createIntegration());
        const editorSettingsFile = path.resolve('editor_settings.tres');
        fsMocks.existsSync.mockReturnValue(true);

        await expect(
            service.disableForProject(editorSettingsFile),
        ).resolves.toBeUndefined();

        expect(fsMocks.existsSync).toHaveBeenCalledWith(editorSettingsFile);
        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            editorSettingsFile,
            {
                useExternalEditor: false,
            },
        );
    });

    it('does nothing when the Godot settings file is missing', async () => {
        const service = createService(createIntegration());
        const editorSettingsFile = path.resolve('missing-editor_settings.tres');

        await expect(
            service.disableForProject(editorSettingsFile),
        ).resolves.toBeUndefined();

        expect(fsMocks.existsSync).toHaveBeenCalledWith(editorSettingsFile);
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });
});
