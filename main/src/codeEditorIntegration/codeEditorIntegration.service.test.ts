import * as path from 'node:path';
import type { CodeEditorId } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_DIR_NAME } from '../constants.js';

vi.mock('../commands/userPreferences.js', () => ({
    getUserPreferences: vi.fn(),
    setUserPreferences: vi.fn(),
}));

import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import type {
    CodeEditorIntegrationSettingsStore,
    StoredCodeEditorIntegrationSettings,
} from './codeEditorIntegration.settingsStore.js';
import type {
    CodeEditorIntegration,
    CodeEditorProjectContext,
} from './codeEditorIntegration.types.js';

const CODE_EDITOR_ID = 'vscode' as const;
const OTHER_CODE_EDITOR_ID = 'other-editor' as CodeEditorId;

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
        ...overrides,
    };
}

function createIntegration(
    integrationId: CodeEditorId = CODE_EDITOR_ID,
): CodeEditorIntegration {
    return {
        metadata: {
            id: integrationId,
            displayName:
                integrationId === CODE_EDITOR_ID
                    ? 'Visual Studio Code'
                    : 'Other Editor',
            capabilities: {
                dotnet: true,
            },
        },
        defaultSettings: { execFlags: '{project} --goto {file}:{line}:{col}' },
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
        resolveGodotConfiguration: vi.fn().mockReturnValue({
            textEditor: {
                execPath: path.resolve('tools', 'code'),
                execFlags: '{project} --goto {file}:{line}:{col}',
            },
        }),
        configureProject: vi.fn().mockResolvedValue({
            recoveredConfigFiles: [],
        }),
    };
}

function createSettingsStore(
    settings: StoredCodeEditorIntegrationSettings = {
        enabled: true,
        customPath: null,
        execFlagsOverride: null,
    },
): CodeEditorIntegrationSettingsStore {
    return {
        getDefaultIntegrationId: vi.fn().mockResolvedValue(null),
        setDefaultIntegrationId: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(settings),
        update: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodeEditorIntegrationSettingsStore;
}

function createService(
    integration: CodeEditorIntegration,
    settingsStore = createSettingsStore(),
) {
    return new CodeEditorIntegrationService(
        new CodeEditorIntegrationRegistry([integration]),
        settingsStore,
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

    it('returns a serializable installation summary when scanning', async () => {
        const integration = createIntegration();
        const service = createService(integration);

        await expect(service.scanIntegration(CODE_EDITOR_ID)).resolves.toEqual({
            integrationId: CODE_EDITOR_ID,
            path: path.resolve('tools', 'code'),
            version: null,
        });
    });

    it('returns stored settings and detected state without configuring a project', async () => {
        const customPath = path.resolve('custom', 'code');
        const integration = createIntegration();
        const settingsStore = createSettingsStore({
            enabled: false,
            customPath,
            execFlagsOverride: '--goto {file}',
        });
        const service = createService(integration, settingsStore);

        await expect(service.listIntegrationSettings()).resolves.toEqual([
            {
                integration: integration.metadata,
                enabled: false,
                isDefault: false,
                customPath,
                defaultExecFlags: '{project} --goto {file}:{line}:{col}',
                execFlagsOverride: '--goto {file}',
                resolvedExecFlags: '--goto {file}',
                installation: {
                    integrationId: CODE_EDITOR_ID,
                    path: path.resolve('tools', 'code'),
                    version: null,
                },
                resolvedGodotExecPath: path.resolve('tools', 'code'),
            },
        ]);
        expect(integration.detectInstallation).toHaveBeenCalledWith(customPath);
        expect(integration.resolveGodotConfiguration).toHaveBeenCalledWith({
            installation: {
                path: path.resolve('tools', 'code'),
                version: null,
            },
            settings: { execFlagsOverride: '--goto {file}' },
            godotFlavor: 'standard',
            godotVersion: 4,
        });
        expect(integration.configureProject).not.toHaveBeenCalled();
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });

    it('rescans one integration and returns its current settings', async () => {
        const integration = createIntegration();
        const settingsStore = createSettingsStore();
        vi.mocked(settingsStore.getDefaultIntegrationId).mockResolvedValue(
            CODE_EDITOR_ID,
        );
        const service = createService(integration, settingsStore);

        await expect(
            service.rescanIntegration(CODE_EDITOR_ID),
        ).resolves.toMatchObject({
            integration: integration.metadata,
            isDefault: true,
            installation: {
                integrationId: CODE_EDITOR_ID,
                path: path.resolve('tools', 'code'),
            },
        });
        expect(integration.detectInstallation).toHaveBeenCalledOnce();
    });

    it.each([
        { enabled: false, available: true },
        { enabled: true, available: false },
    ])('preserves the stored default marker when eligibility is $enabled/$available', async ({
        enabled,
        available,
    }) => {
        const integration = createIntegration();
        const settingsStore = createSettingsStore({
            enabled,
            customPath: null,
            execFlagsOverride: null,
        });
        vi.mocked(settingsStore.getDefaultIntegrationId).mockResolvedValue(
            CODE_EDITOR_ID,
        );
        if (!available) {
            vi.mocked(integration.detectInstallation).mockResolvedValue(null);
        }
        const service = createService(integration, settingsStore);

        await expect(service.listIntegrationSettings()).resolves.toMatchObject([
            { isDefault: true },
        ]);
    });

    it('persists a default integration and returns refreshed settings', async () => {
        const integration = createIntegration();
        const settingsStore = createSettingsStore();
        vi.mocked(settingsStore.getDefaultIntegrationId).mockResolvedValue(
            CODE_EDITOR_ID,
        );
        const service = createService(integration, settingsStore);

        await expect(
            service.setDefaultIntegration(CODE_EDITOR_ID),
        ).resolves.toMatchObject([{ isDefault: true }]);
        expect(settingsStore.setDefaultIntegrationId).toHaveBeenCalledWith(
            CODE_EDITOR_ID,
        );
    });

    it('rejects disabled and unavailable integrations as defaults', async () => {
        const disabledIntegration = createIntegration();
        const disabledStore = createSettingsStore({
            enabled: false,
            customPath: null,
            execFlagsOverride: null,
        });
        const disabledService = createService(
            disabledIntegration,
            disabledStore,
        );

        await expect(
            disabledService.setDefaultIntegration(CODE_EDITOR_ID),
        ).rejects.toThrow('Visual Studio Code is disabled.');
        expect(disabledIntegration.detectInstallation).not.toHaveBeenCalled();
        expect(disabledStore.setDefaultIntegrationId).not.toHaveBeenCalled();

        const unavailableIntegration = createIntegration();
        vi.mocked(unavailableIntegration.detectInstallation).mockResolvedValue(
            null,
        );
        const unavailableStore = createSettingsStore();
        const unavailableService = createService(
            unavailableIntegration,
            unavailableStore,
        );

        await expect(
            unavailableService.setDefaultIntegration(CODE_EDITOR_ID),
        ).rejects.toThrow('Visual Studio Code installation was not found.');
        expect(unavailableStore.setDefaultIntegrationId).not.toHaveBeenCalled();
    });

    it('validates and normalizes settings before storing them', async () => {
        const customPath = path.resolve('custom', 'code');
        const integration = createIntegration();
        const settingsStore = createSettingsStore({
            enabled: false,
            customPath,
            execFlagsOverride: '',
        });
        const service = createService(integration, settingsStore);

        await expect(
            service.updateIntegrationSettings(CODE_EDITOR_ID, {
                enabled: false,
                customPath: ` ${customPath} `,
                execFlagsOverride: '   ',
            }),
        ).resolves.toMatchObject({
            enabled: false,
            customPath,
            execFlagsOverride: '',
            resolvedExecFlags: '',
        });
        expect(integration.validatePath).toHaveBeenCalledWith(customPath);
        expect(settingsStore.update).toHaveBeenCalledWith(CODE_EDITOR_ID, {
            enabled: false,
            customPath,
            execFlagsOverride: '',
        });
        expect(integration.configureProject).not.toHaveBeenCalled();
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });

    it('reports selection eligibility without detecting disabled integrations', async () => {
        const integration = createIntegration();
        const disabledService = createService(
            integration,
            createSettingsStore({
                enabled: false,
                customPath: path.resolve('custom', 'code'),
                execFlagsOverride: null,
            }),
        );

        await expect(
            disabledService.getSelectionEligibility(CODE_EDITOR_ID),
        ).resolves.toBe('disabled');
        expect(integration.detectInstallation).not.toHaveBeenCalled();

        const unavailableIntegration = createIntegration();
        vi.mocked(unavailableIntegration.detectInstallation).mockResolvedValue(
            null,
        );
        const unavailableService = createService(unavailableIntegration);

        await expect(
            unavailableService.getSelectionEligibility(CODE_EDITOR_ID),
        ).resolves.toBe('unavailable');

        const eligibleIntegration = createIntegration();
        const eligibleService = createService(eligibleIntegration);

        await expect(
            eligibleService.getSelectionEligibility(CODE_EDITOR_ID),
        ).resolves.toBe('eligible');
    });

    it('forwards a custom path when scanning an integration', async () => {
        const integration = createIntegration();
        const service = createService(integration);
        const customPath = path.resolve('custom', 'code');

        await service.scanIntegration(CODE_EDITOR_ID, customPath);

        expect(integration.detectInstallation).toHaveBeenCalledWith(customPath);
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
        const customPath = path.resolve('custom', 'code');
        const execFlagsOverride = '--custom {file}:{line}';
        const recoveredFile = path.resolve(
            projectPath,
            '.vscode',
            'settings.json.bad',
        );
        const integration = createIntegration();
        vi.mocked(integration.configureProject).mockResolvedValue({
            recoveredConfigFiles: [recoveredFile, recoveredFile],
        });
        vi.mocked(integration.resolveGodotConfiguration).mockReturnValue({
            textEditor: {
                execPath: customPath,
                execFlags: execFlagsOverride,
            },
        });
        const settingsStore = createSettingsStore({
            enabled: true,
            customPath,
            execFlagsOverride,
        });
        const service = createService(integration, settingsStore);
        const context = createContext({ projectPath });
        fsMocks.existsSync.mockReturnValue(true);

        await expect(
            service.applyToProject(CODE_EDITOR_ID, context),
        ).resolves.toEqual({
            editorSettingsFile: context.editorSettingsFile,
            recoveredConfigFiles: ['.vscode/settings.json.bad'],
        });
        expect(settingsStore.get).toHaveBeenCalledWith(CODE_EDITOR_ID);
        expect(integration.detectInstallation).toHaveBeenCalledWith(customPath);
        expect(integration.resolveGodotConfiguration).toHaveBeenCalledWith({
            installation: {
                path: path.resolve('tools', 'code'),
                version: null,
            },
            settings: { execFlagsOverride },
            godotFlavor: 'standard',
            godotVersion: context.godotVersion,
        });
        expect(integration.configureProject).toHaveBeenCalledWith(context);
        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            context.editorSettingsFile,
            {
                textEditor: {
                    enabled: true,
                    execPath: customPath,
                    execFlags: execFlagsOverride,
                },
            },
        );
    });

    it('creates Godot settings when an existing file is unavailable', async () => {
        const integration = createIntegration();
        const service = createService(integration);
        const context = createContext({
            editorSettingsFile: '',
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
        expect(godotProjectMocks.createNewEditorSettings).toHaveBeenCalledWith({
            templatePath: path.resolve(
                path.resolve('assets'),
                TEMPLATE_DIR_NAME,
            ),
            launchPath: context.godotLaunchPath,
            editorConfigFilename: context.editorSettingsFilename,
            editorConfigFormat: context.editorSettingsFormat,
            codeEditorSettings: {
                textEditor: {
                    enabled: true,
                    execPath: path.resolve('tools', 'code'),
                    execFlags: '{project} --goto {file}:{line}:{col}',
                },
            },
        });
        expect(integration.detectInstallation).toHaveBeenCalledWith(undefined);
        expect(integration.resolveGodotConfiguration).toHaveBeenCalledWith({
            installation: {
                path: path.resolve('tools', 'code'),
                version: null,
            },
            settings: { execFlagsOverride: null },
            godotFlavor: 'standard',
            godotVersion: context.godotVersion,
        });
    });

    it('applies integration-owned .NET settings without assuming VS Code values', async () => {
        const integration = createIntegration();
        const dotnet = {
            externalEditorId: 7,
            customLaunchConfiguration: {
                execPath: path.resolve('tools', 'custom-editor'),
                execFlags: '--open "{file}"',
            },
        };
        vi.mocked(integration.resolveGodotConfiguration).mockReturnValue({
            textEditor: {
                execPath: path.resolve('tools', 'editor'),
                execFlags: '{file}',
            },
            dotnet,
        });
        const service = createService(integration);
        const context = createContext({ mono: true });
        fsMocks.existsSync.mockReturnValue(true);

        await service.applyToProject(CODE_EDITOR_ID, context);

        expect(integration.resolveGodotConfiguration).toHaveBeenCalledWith({
            installation: {
                path: path.resolve('tools', 'code'),
                version: null,
            },
            settings: { execFlagsOverride: null },
            godotFlavor: 'dotnet',
            godotVersion: context.godotVersion,
        });
        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            context.editorSettingsFile,
            {
                textEditor: {
                    enabled: true,
                    execPath: path.resolve('tools', 'editor'),
                    execFlags: '{file}',
                },
                dotnet,
            },
        );
    });

    it('selects generic Disabled when a .NET integration has no dedicated configuration', async () => {
        const integration = createIntegration();
        const service = createService(integration);
        const context = createContext({ mono: true });
        fsMocks.existsSync.mockReturnValue(true);

        await service.applyToProject(CODE_EDITOR_ID, context);

        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            context.editorSettingsFile,
            {
                textEditor: {
                    enabled: true,
                    execPath: path.resolve('tools', 'code'),
                    execFlags: '{project} --goto {file}:{line}:{col}',
                },
                dotnet: null,
            },
        );
    });

    it('does not configure a project when the integration is unavailable', async () => {
        const customPath = path.resolve('missing', 'code');
        const integration = createIntegration();
        vi.mocked(integration.detectInstallation).mockResolvedValue(null);
        const settingsStore = createSettingsStore({
            enabled: true,
            customPath,
            execFlagsOverride: '--custom',
        });
        const service = createService(integration, settingsStore);

        await expect(
            service.applyToProject(CODE_EDITOR_ID, createContext()),
        ).rejects.toThrow('Visual Studio Code installation was not found.');
        expect(settingsStore.get).toHaveBeenCalledWith(CODE_EDITOR_ID);
        expect(integration.detectInstallation).toHaveBeenCalledWith(customPath);
        expect(integration.configureProject).not.toHaveBeenCalled();
        expect(integration.resolveGodotConfiguration).not.toHaveBeenCalled();
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });

    it('disables the external editor in existing Godot settings', async () => {
        const service = createService(createIntegration());
        const editorSettingsFile = path.resolve('editor_settings.tres');
        fsMocks.existsSync.mockReturnValue(true);

        await expect(
            service.disableForProject(editorSettingsFile, 'standard'),
        ).resolves.toBeUndefined();

        expect(fsMocks.existsSync).toHaveBeenCalledWith(editorSettingsFile);
        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            editorSettingsFile,
            {
                textEditor: { enabled: false },
            },
        );
    });

    it('also selects generic Disabled when disabling a .NET project', async () => {
        const service = createService(createIntegration());
        const editorSettingsFile = path.resolve('editor_settings.tres');
        fsMocks.existsSync.mockReturnValue(true);

        await service.disableForProject(editorSettingsFile, 'dotnet');

        expect(godotProjectMocks.updateEditorSettings).toHaveBeenCalledWith(
            editorSettingsFile,
            {
                textEditor: { enabled: false },
                dotnet: null,
            },
        );
    });

    it('does nothing when the Godot settings file is missing', async () => {
        const service = createService(createIntegration());
        const editorSettingsFile = path.resolve('missing-editor_settings.tres');

        await expect(
            service.disableForProject(editorSettingsFile, 'standard'),
        ).resolves.toBeUndefined();

        expect(fsMocks.existsSync).toHaveBeenCalledWith(editorSettingsFile);
        expect(godotProjectMocks.updateEditorSettings).not.toHaveBeenCalled();
    });

    it('finds every enabled integration already configured for a project', async () => {
        const integration = createIntegration();
        const otherIntegration = createIntegration(OTHER_CODE_EDITOR_ID);
        const service = new CodeEditorIntegrationService(
            new CodeEditorIntegrationRegistry([integration, otherIntegration]),
            createSettingsStore(),
        );

        await expect(
            service.findConfiguredIntegrations(path.resolve('project')),
        ).resolves.toEqual([CODE_EDITOR_ID, OTHER_CODE_EDITOR_ID]);
        expect(integration.isConfiguredForProject).toHaveBeenCalledOnce();
        expect(otherIntegration.isConfiguredForProject).toHaveBeenCalledOnce();
    });

    it('ignores disabled integrations during project inference', async () => {
        const integration = createIntegration();
        const otherIntegration = createIntegration(OTHER_CODE_EDITOR_ID);
        const settingsStore = createSettingsStore();
        vi.mocked(settingsStore.get).mockImplementation(
            async (integrationId) => ({
                enabled: integrationId === OTHER_CODE_EDITOR_ID,
                customPath: null,
                execFlagsOverride: null,
            }),
        );
        const service = new CodeEditorIntegrationService(
            new CodeEditorIntegrationRegistry([integration, otherIntegration]),
            settingsStore,
        );

        await expect(
            service.findConfiguredIntegrations(path.resolve('project')),
        ).resolves.toEqual([OTHER_CODE_EDITOR_ID]);
        expect(integration.isConfiguredForProject).not.toHaveBeenCalled();
        expect(otherIntegration.isConfiguredForProject).toHaveBeenCalledOnce();
    });

    it('returns no inference matches when no integration is configured', async () => {
        const integration = createIntegration();
        vi.mocked(integration.isConfiguredForProject).mockResolvedValue(false);
        const service = createService(integration);

        await expect(
            service.findConfiguredIntegrations(path.resolve('project')),
        ).resolves.toEqual([]);
        expect(integration.isConfiguredForProject).toHaveBeenCalledOnce();
    });
});
