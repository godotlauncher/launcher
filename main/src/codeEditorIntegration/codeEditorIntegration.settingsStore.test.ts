import type { UserPreferences } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferenceMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
    setUserPreferences: vi.fn(),
}));

vi.mock('../commands/userPreferences.js', () => preferenceMocks);

import { CodeEditorIntegrationSettingsStore } from './codeEditorIntegration.settingsStore.js';

function createPreferences(
    overrides: Partial<UserPreferences> = {},
): UserPreferences {
    return {
        prefs_version: 3,
        install_location: 'installs',
        config_location: 'config',
        projects_location: 'projects',
        auto_check_updates: true,
        receive_beta_updates: false,
        post_launch_action: 'none',
        auto_start: false,
        start_in_tray: false,
        confirm_project_remove: true,
        first_run: false,
        windows_enable_symlinks: false,
        windows_symlink_win_notify: false,
        ...overrides,
    };
}

describe('CodeEditorIntegrationSettingsStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        preferenceMocks.setUserPreferences.mockImplementation(
            async (value) => value,
        );
    });

    it('reads and updates the default integration without changing other preferences', async () => {
        const preferences = createPreferences({
            language: 'de',
            code_editor_integrations: {
                vscode: { enabled: false, executable_path: 'custom/code' },
            },
        });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);
        const store = new CodeEditorIntegrationSettingsStore();

        await expect(store.getDefaultIntegrationId()).resolves.toBeNull();
        await store.setDefaultIntegrationId('vscode');

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    executable_path: 'custom/code',
                    is_default: true,
                },
            },
        });
    });

    it('reads all VS Code integration settings from its own preference object', async () => {
        preferenceMocks.getUserPreferences.mockResolvedValue(
            createPreferences({
                code_editor_integrations: {
                    vscode: {
                        enabled: false,
                        executable_path: ' custom/code ',
                        executable_args: '',
                    },
                },
            }),
        );

        await expect(
            new CodeEditorIntegrationSettingsStore().get('vscode'),
        ).resolves.toEqual({
            enabled: false,
            customPath: 'custom/code',
            execFlagsOverride: '',
        });
    });

    it('does not read the legacy VS Code path into the new integration', async () => {
        preferenceMocks.getUserPreferences.mockResolvedValue(
            createPreferences({}),
        );

        await expect(
            new CodeEditorIntegrationSettingsStore().get('vscode'),
        ).resolves.toEqual({
            enabled: true,
            customPath: null,
            execFlagsOverride: null,
        });
    });

    it('writes the executable path inside the VS Code integration object', async () => {
        const preferences = createPreferences({
            language: 'de',
        });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);

        await new CodeEditorIntegrationSettingsStore().update('vscode', {
            enabled: false,
            customPath: 'custom/code',
            execFlagsOverride: '--goto {file}',
        });

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    executable_path: 'custom/code',
                    executable_args: '--goto {file}',
                },
            },
        });
    });

    it('clears integration overrides without changing legacy preferences', async () => {
        const preferences = createPreferences({
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    executable_args: '--old',
                    is_default: true,
                },
            },
        });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);

        await new CodeEditorIntegrationSettingsStore().update('vscode', {
            enabled: true,
            customPath: null,
            execFlagsOverride: null,
        });

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            code_editor_integrations: {
                vscode: { enabled: true, is_default: true },
            },
        });
    });
});
