import type {
    CodeEditorIntegrationSettings,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';

export type CodeEditorSettingsForm = {
    enabled: boolean;
    customPath: string;
    execFlags: string;
};

export type CodeEditorPathFieldState = {
    value: string;
    autodetected: boolean;
};

export function resolveCodeEditorPathFieldState(
    settings: CodeEditorIntegrationSettings,
    customPath: string,
): CodeEditorPathFieldState {
    if (customPath) {
        return { value: customPath, autodetected: false };
    }

    const detectedPath =
        settings.resolvedGodotExecPath ?? settings.installation?.path ?? '';

    return {
        value: detectedPath,
        autodetected: Boolean(detectedPath),
    };
}

export function createCodeEditorSettingsForm(
    settings: CodeEditorIntegrationSettings,
): CodeEditorSettingsForm {
    return {
        enabled: settings.enabled,
        customPath: settings.customPath ?? '',
        execFlags: settings.execFlagsOverride ?? settings.defaultExecFlags,
    };
}

export function toCodeEditorSettingsUpdate(
    settings: CodeEditorIntegrationSettings,
    form: CodeEditorSettingsForm,
): UpdateCodeEditorIntegrationSettings {
    const customPath = form.customPath.trim();
    const execFlags = form.execFlags.trim();

    return {
        enabled: form.enabled,
        customPath: customPath || null,
        execFlagsOverride:
            execFlags === settings.defaultExecFlags ? null : execFlags,
    };
}

export function hasCodeEditorSettingsChanges(
    settings: CodeEditorIntegrationSettings,
    form: CodeEditorSettingsForm,
): boolean {
    const update = toCodeEditorSettingsUpdate(settings, form);

    return (
        update.enabled !== settings.enabled ||
        update.customPath !== settings.customPath ||
        update.execFlagsOverride !== settings.execFlagsOverride
    );
}

export function resetCodeEditorExecFlags(
    settings: CodeEditorIntegrationSettings,
): string {
    return settings.defaultExecFlags;
}
