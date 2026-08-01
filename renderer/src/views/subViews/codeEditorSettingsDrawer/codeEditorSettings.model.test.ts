import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    createCodeEditorSettingsForm,
    hasCodeEditorSettingsChanges,
    resetCodeEditorExecFlags,
    resolveCodeEditorPathFieldState,
    toCodeEditorSettingsUpdate,
} from './codeEditorSettings.model';

const settings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { textEditor: true, dotnet: true },
    },
    isDefault: false,
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project} --goto {file}:{line}:{col}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project} --goto {file}:{line}:{col}',
    installation: null,
    resolvedGodotExecPath: null,
};

describe('codeEditorSettings.model', () => {
    it('creates a form from defaults', () => {
        expect(createCodeEditorSettingsForm(settings)).toEqual({
            enabled: true,
            customPath: '',
            execFlags: settings.defaultExecFlags,
        });
        expect(
            hasCodeEditorSettingsChanges(
                settings,
                createCodeEditorSettingsForm(settings),
            ),
        ).toBe(false);
    });

    it('prefers a custom path and otherwise shows the platform-resolved path', () => {
        const detectedSettings = {
            ...settings,
            installation: {
                integrationId: 'vscode' as const,
                path: 'detected-installation-path',
                version: null,
            },
            resolvedGodotExecPath: 'platform-executable-path',
        };

        expect(
            resolveCodeEditorPathFieldState(detectedSettings, 'custom-path'),
        ).toEqual({ value: 'custom-path', autodetected: false });
        expect(resolveCodeEditorPathFieldState(detectedSettings, '')).toEqual({
            value: 'platform-executable-path',
            autodetected: true,
        });
        expect(resolveCodeEditorPathFieldState(settings, '')).toEqual({
            value: '',
            autodetected: false,
        });
    });

    it('normalizes paths and preserves an empty launch-argument override', () => {
        expect(
            toCodeEditorSettingsUpdate(settings, {
                enabled: false,
                customPath: ' custom/code ',
                execFlags: '   ',
            }),
        ).toEqual({
            enabled: false,
            customPath: 'custom/code',
            execFlagsOverride: '',
        });
    });

    it('resets launch arguments to the integration default', () => {
        expect(resetCodeEditorExecFlags(settings)).toBe(
            settings.defaultExecFlags,
        );
        expect(
            toCodeEditorSettingsUpdate(settings, {
                enabled: true,
                customPath: '',
                execFlags: resetCodeEditorExecFlags(settings),
            }),
        ).toEqual({
            enabled: true,
            customPath: null,
            execFlagsOverride: null,
        });
    });
});
