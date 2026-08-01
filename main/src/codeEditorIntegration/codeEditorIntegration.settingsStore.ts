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
    async get(
        integrationId: CodeEditorId,
    ): Promise<StoredCodeEditorIntegrationSettings> {
        const preferences = await getUserPreferences();
        const integrationPreferences =
            preferences.code_editor_integrations?.[integrationId];
        const storedCustomPath = this.normalizePath(
            integrationPreferences?.custom_path,
        );
        const legacyVSCodePath =
            integrationId === 'vscode'
                ? this.normalizePath(preferences.vs_code_path)
                : null;

        return {
            enabled: integrationPreferences?.enabled ?? true,
            customPath: legacyVSCodePath ?? storedCustomPath,
            execFlagsOverride:
                typeof integrationPreferences?.text_editor_exec_flags_override ===
                'string'
                    ? integrationPreferences.text_editor_exec_flags_override
                    : null,
        };
    }

    async update(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<void> {
        const preferences = await getUserPreferences();
        const integrationPreferences: CodeEditorIntegrationPreferences = {
            enabled: settings.enabled,
            ...(integrationId !== 'vscode' && settings.customPath
                ? { custom_path: settings.customPath }
                : {}),
            ...(settings.execFlagsOverride !== null
                ? {
                      text_editor_exec_flags_override:
                          settings.execFlagsOverride,
                  }
                : {}),
        };
        const nextPreferences: UserPreferences = {
            ...preferences,
            code_editor_integrations: {
                ...preferences.code_editor_integrations,
                [integrationId]: integrationPreferences,
            },
            ...(integrationId === 'vscode'
                ? { vs_code_path: settings.customPath ?? '' }
                : {}),
        };

        await setUserPreferences(nextPreferences);
    }

    private normalizePath(value: string | undefined): string | null {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }
}
