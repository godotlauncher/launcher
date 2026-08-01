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

    it('reads the legacy VS Code path and defaults enabled state', async () => {
        preferenceMocks.getUserPreferences.mockResolvedValue(
            createPreferences({
                vs_code_path: ' custom/code ',
                code_editor_integrations: {
                    vscode: {
                        enabled: false,
                        custom_path: 'ignored/map/code',
                        text_editor_exec_flags_override: '',
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

    it('falls back to the new map when the legacy path is empty', async () => {
        preferenceMocks.getUserPreferences.mockResolvedValue(
            createPreferences({
                vs_code_path: '',
                code_editor_integrations: {
                    vscode: { custom_path: 'map/code' },
                },
            }),
        );

        await expect(
            new CodeEditorIntegrationSettingsStore().get('vscode'),
        ).resolves.toEqual({
            enabled: true,
            customPath: 'map/code',
            execFlagsOverride: null,
        });
    });

    it('keeps the legacy path synchronized when settings are updated', async () => {
        const preferences = createPreferences({ language: 'de' });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);

        await new CodeEditorIntegrationSettingsStore().update('vscode', {
            enabled: false,
            customPath: 'custom/code',
            execFlagsOverride: '--goto {file}',
        });

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            vs_code_path: 'custom/code',
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    text_editor_exec_flags_override: '--goto {file}',
                },
            },
        });
    });

    it('clears compatibility values when defaults are restored', async () => {
        const preferences = createPreferences({
            vs_code_path: 'old/code',
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    text_editor_exec_flags_override: '--old',
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
            vs_code_path: '',
            code_editor_integrations: {
                vscode: { enabled: true },
            },
        });
    });
});
