import { Injectable } from '@mariodebono/di';
import type {
    CodeEditorId,
    CodeEditorIntegrationPreferences,
    UpdateCodeEditorIntegrationSettings,
    UserPreferences,
} from '@shared/contracts';
import {
    getUserPreferences,
    setUserPreferences,
} from '../commands/userPreferences.js';

export type StoredCodeEditorIntegrationSettings = {
    enabled: boolean;
    customPath: string | null;
    execFlagsOverride: string | null;
};

export type StoredDetectedCodeEditorInstallation = {
    installation: {
        path: string;
        version: string | null;
    } | null;
    checkedAt: number;
};

@Injectable()
export class CodeEditorIntegrationSettingsStore {
    private preferenceWrite: Promise<void> = Promise.resolve();

    async getDefaultIntegrationId(): Promise<CodeEditorId | null> {
        const preferences = await getUserPreferences();
        const integrationSettings = preferences.code_editor_integrations ?? {};

        return (
            (Object.keys(integrationSettings) as CodeEditorId[]).find(
                (integrationId) =>
                    integrationSettings[integrationId]?.is_default === true,
            ) ?? null
        );
    }

    async setDefaultIntegrationId(integrationId: CodeEditorId): Promise<void> {
        await this.updatePreferences((preferences) => {
            const currentIntegrations =
                preferences.code_editor_integrations ?? {};
            const nextIntegrations = Object.fromEntries(
                Object.entries(currentIntegrations).map(
                    ([currentId, settings]) => [
                        currentId,
                        {
                            ...settings,
                            is_default: currentId === integrationId,
                        },
                    ],
                ),
            ) as Partial<
                Record<CodeEditorId, CodeEditorIntegrationPreferences>
            >;
            nextIntegrations[integrationId] = {
                ...currentIntegrations[integrationId],
                is_default: true,
            };

            return {
                ...preferences,
                code_editor_integrations: nextIntegrations,
            };
        });
    }

    async get(
        integrationId: CodeEditorId,
    ): Promise<StoredCodeEditorIntegrationSettings> {
        const preferences = await getUserPreferences();
        const integrationPreferences =
            preferences.code_editor_integrations?.[integrationId];

        return {
            enabled: integrationPreferences?.enabled ?? true,
            customPath: this.normalizePath(
                integrationPreferences?.executable_path,
            ),
            execFlagsOverride:
                typeof integrationPreferences?.executable_args === 'string'
                    ? integrationPreferences.executable_args
                    : null,
        };
    }

    async getDetectedInstallation(
        integrationId: CodeEditorId,
    ): Promise<StoredDetectedCodeEditorInstallation | undefined> {
        const preferences = await getUserPreferences();
        const detected =
            preferences.code_editor_integrations?.[integrationId]
                ?.detected_installations?.[process.platform]?.[process.arch];
        if (
            !detected ||
            typeof detected.checked_at !== 'number' ||
            !Number.isFinite(detected.checked_at)
        ) {
            return undefined;
        }

        const detectedPath = this.normalizePath(
            typeof detected.path === 'string' ? detected.path : undefined,
        );
        return {
            installation: detectedPath
                ? {
                      path: detectedPath,
                      version:
                          typeof detected.version === 'string'
                              ? detected.version
                              : null,
                  }
                : null,
            checkedAt: detected.checked_at,
        };
    }

    async setDetectedInstallation(
        integrationId: CodeEditorId,
        installation: { path: string; version: string | null } | null,
        checkedAt: number,
    ): Promise<void> {
        await this.updatePreferences((preferences) => {
            const currentIntegration =
                preferences.code_editor_integrations?.[integrationId];
            return {
                ...preferences,
                code_editor_integrations: {
                    ...preferences.code_editor_integrations,
                    [integrationId]: {
                        ...currentIntegration,
                        detected_installations: {
                            ...currentIntegration?.detected_installations,
                            [process.platform]: {
                                ...currentIntegration?.detected_installations?.[
                                    process.platform
                                ],
                                [process.arch]: {
                                    path: installation?.path ?? null,
                                    version: installation?.version ?? null,
                                    checked_at: checkedAt,
                                },
                            },
                        },
                    },
                },
            };
        });
    }

    async update(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<void> {
        await this.updatePreferences((preferences) => {
            const currentIntegrationPreferences =
                preferences.code_editor_integrations?.[integrationId];
            const integrationPreferences: CodeEditorIntegrationPreferences = {
                ...(typeof currentIntegrationPreferences?.is_default ===
                'boolean'
                    ? { is_default: currentIntegrationPreferences.is_default }
                    : {}),
                ...(currentIntegrationPreferences?.detected_installations
                    ? {
                          detected_installations:
                              currentIntegrationPreferences.detected_installations,
                      }
                    : {}),
                enabled: settings.enabled,
                ...(settings.customPath
                    ? { executable_path: settings.customPath }
                    : {}),
                ...(settings.execFlagsOverride !== null
                    ? {
                          executable_args: settings.execFlagsOverride,
                      }
                    : {}),
            };
            return {
                ...preferences,
                code_editor_integrations: {
                    ...preferences.code_editor_integrations,
                    [integrationId]: integrationPreferences,
                },
            };
        });
    }

    private async updatePreferences(
        update: (preferences: UserPreferences) => UserPreferences,
    ): Promise<void> {
        const write = this.preferenceWrite
            .catch(() => undefined)
            .then(async () => {
                const preferences = await getUserPreferences();
                await setUserPreferences(update(preferences));
            });
        this.preferenceWrite = write;
        await write;
    }

    private normalizePath(value: string | undefined): string | null {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }
}
