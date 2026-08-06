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

    it('clears the default integration without changing its other settings', async () => {
        const preferences = createPreferences({
            code_editor_integrations: {
                vscode: {
                    enabled: true,
                    executable_path: 'custom/code',
                    is_default: true,
                },
            },
        });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);
        const store = new CodeEditorIntegrationSettingsStore();

        await store.setDefaultIntegrationId(null);

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            code_editor_integrations: {
                vscode: {
                    enabled: true,
                    executable_path: 'custom/code',
                    is_default: false,
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
    it('reads only the detected installation for the current OS and architecture', async () => {
        preferenceMocks.getUserPreferences.mockResolvedValue(
            createPreferences({
                code_editor_integrations: {
                    vscodium: {
                        detected_installations: {
                            [process.platform]: {
                                [process.arch]: {
                                    path: ' /usr/bin/flatpak ',
                                    version: null,
                                    checked_at: 123,
                                },
                                other: {
                                    path: '/other/architecture',
                                    version: '1.0.0',
                                    checked_at: 100,
                                },
                            },
                        },
                    },
                },
            }),
        );

        await expect(
            new CodeEditorIntegrationSettingsStore().getDetectedInstallation(
                'vscodium',
            ),
        ).resolves.toEqual({
            installation: {
                path: '/usr/bin/flatpak',
                version: null,
            },
            checkedAt: 123,
        });
    });

    it('writes the current OS and architecture without removing portable entries', async () => {
        const preferences = createPreferences({
            code_editor_integrations: {
                vscodium: {
                    enabled: false,
                    detected_installations: {
                        other_platform: {
                            x64: {
                                path: '/portable/other',
                                version: '1.0.0',
                                checked_at: 50,
                            },
                        },
                    },
                },
            },
        });
        preferenceMocks.getUserPreferences.mockResolvedValue(preferences);

        await new CodeEditorIntegrationSettingsStore().setDetectedInstallation(
            'vscodium',
            { path: '/usr/bin/flatpak', version: null },
            123,
        );

        expect(preferenceMocks.setUserPreferences).toHaveBeenCalledWith({
            ...preferences,
            code_editor_integrations: {
                vscodium: {
                    enabled: false,
                    detected_installations: {
                        other_platform: {
                            x64: {
                                path: '/portable/other',
                                version: '1.0.0',
                                checked_at: 50,
                            },
                        },
                        [process.platform]: {
                            [process.arch]: {
                                path: '/usr/bin/flatpak',
                                version: null,
                                checked_at: 123,
                            },
                        },
                    },
                },
            },
        });
    });
    it('serializes detection writes for different integrations', async () => {
        let preferences = createPreferences();
        preferenceMocks.getUserPreferences.mockImplementation(
            async () => preferences,
        );
        preferenceMocks.setUserPreferences.mockImplementation(async (value) => {
            preferences = value;
            return value;
        });
        const store = new CodeEditorIntegrationSettingsStore();

        await Promise.all([
            store.setDetectedInstallation(
                'vscode',
                { path: 'code', version: null },
                100,
            ),
            store.setDetectedInstallation(
                'vscodium',
                { path: 'codium', version: '1.2.3' },
                200,
            ),
        ]);

        expect(
            preferences.code_editor_integrations?.vscode
                ?.detected_installations?.[process.platform]?.[process.arch],
        ).toEqual({
            path: 'code',
            version: null,
            checked_at: 100,
        });
        expect(
            preferences.code_editor_integrations?.vscodium
                ?.detected_installations?.[process.platform]?.[process.arch],
        ).toEqual({
            path: 'codium',
            version: '1.2.3',
            checked_at: 200,
        });
    });
});
