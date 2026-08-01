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

@Injectable()
export class CodeEditorIntegrationSettingsStore {
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
        const preferences = await getUserPreferences();
        const currentIntegrations = preferences.code_editor_integrations ?? {};
        const nextIntegrations = Object.fromEntries(
            Object.entries(currentIntegrations).map(([currentId, settings]) => [
                currentId,
                {
                    ...settings,
                    is_default: currentId === integrationId,
                },
            ]),
        ) as Partial<Record<CodeEditorId, CodeEditorIntegrationPreferences>>;
        nextIntegrations[integrationId] = {
            ...currentIntegrations[integrationId],
            is_default: true,
        };

        await setUserPreferences({
            ...preferences,
            code_editor_integrations: nextIntegrations,
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

    async update(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<void> {
        const preferences = await getUserPreferences();
        const currentIntegrationPreferences =
            preferences.code_editor_integrations?.[integrationId];
        const integrationPreferences: CodeEditorIntegrationPreferences = {
            ...(typeof currentIntegrationPreferences?.is_default === 'boolean'
                ? { is_default: currentIntegrationPreferences.is_default }
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
        const nextPreferences: UserPreferences = {
            ...preferences,
            code_editor_integrations: {
                ...preferences.code_editor_integrations,
                [integrationId]: integrationPreferences,
            },
        };

        await setUserPreferences(nextPreferences);
    }

    private normalizePath(value: string | undefined): string | null {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }
}
