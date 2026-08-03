import type {
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSettings,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodeEditorIntegrations } from './useCodeEditorIntegrations.ts';

const integration: CodeEditorIntegrationSummary = {
    id: 'vscode',
    displayName: 'Visual Studio Code',
    capabilities: { dotnet: true },
};
const installation: CodeEditorInstallationSummary = {
    integrationId: 'vscode',
    path: 'detected-code-editor-path',
    version: null,
};
const settings: CodeEditorIntegrationSettings = {
    integration,
    isDefault: false,
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project} --goto {file}:{line}:{col}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project} --goto {file}:{line}:{col}',
    installation,
    resolvedGodotExecPath: installation.path,
};

describe('useCodeEditorIntegrations', () => {
    const listIntegrationSettings = vi.fn(async () => [settings]);
    const rescanIntegration = vi.fn(async () => settings);
    const updateIntegrationSettings = vi.fn(async () => settings);
    const setDefaultIntegration = vi.fn(async () => [
        { ...settings, isDefault: true },
    ]);
    const validateIntegrationPath = vi.fn(
        async (): Promise<CodeEditorPathValidationResult> => ({
            valid: true,
            installation,
        }),
    );

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            electron: {
                'codeEditorIntegration.listIntegrationSettings':
                    listIntegrationSettings,
                'codeEditorIntegration.rescanIntegration': rescanIntegration,
                'codeEditorIntegration.updateIntegrationSettings':
                    updateIntegrationSettings,
                'codeEditorIntegration.setDefaultIntegration':
                    setDefaultIntegration,
                'codeEditorIntegration.validateIntegrationPath':
                    validateIntegrationPath,
            },
        } as unknown as Window;
    });

    function renderHook(): ReturnType<typeof useCodeEditorIntegrations> {
        let captured: ReturnType<typeof useCodeEditorIntegrations> | undefined;

        const Capture = () => {
            captured = useCodeEditorIntegrations();
            return null;
        };

        renderToStaticMarkup(<Capture />);

        if (!captured) {
            throw new Error('Hook was not rendered');
        }
        return captured;
    }

    it('delegates settings operations to the integration bridge', async () => {
        const hook = renderHook();
        const update = {
            enabled: false,
            customPath: null,
            execFlagsOverride: '',
        };

        await expect(hook.listIntegrationSettings()).resolves.toEqual([
            settings,
        ]);
        await expect(hook.rescanIntegration('vscode')).resolves.toEqual(
            settings,
        );
        await expect(
            hook.updateIntegrationSettings('vscode', update),
        ).resolves.toEqual(settings);
        expect(listIntegrationSettings).toHaveBeenCalledOnce();
        expect(rescanIntegration).toHaveBeenCalledWith('vscode');
        await expect(hook.setDefaultIntegration('vscode')).resolves.toEqual([
            { ...settings, isDefault: true },
        ]);
        expect(updateIntegrationSettings).toHaveBeenCalledWith(
            'vscode',
            update,
        );
        expect(setDefaultIntegration).toHaveBeenCalledWith('vscode');
    });

    it('delegates path validation to the integration bridge', async () => {
        const hook = renderHook();
        const candidatePath = 'custom-code-editor-path';

        await expect(
            hook.validateIntegrationPath('vscode', candidatePath),
        ).resolves.toEqual({
            valid: true,
            installation,
        });
        expect(validateIntegrationPath).toHaveBeenCalledWith(
            'vscode',
            candidatePath,
        );
    });
});
