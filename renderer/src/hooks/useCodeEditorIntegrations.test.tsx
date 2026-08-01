import type {
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodeEditorIntegrations } from './useCodeEditorIntegrations.ts';

const integration: CodeEditorIntegrationSummary = {
    id: 'vscode',
    displayName: 'Visual Studio Code',
};
const installation: CodeEditorInstallationSummary = {
    integrationId: 'vscode',
    path: 'detected-code-editor-path',
    version: null,
};

describe('useCodeEditorIntegrations', () => {
    const listIntegrations = vi.fn(async () => [integration]);
    const scanIntegration = vi.fn(async () => installation);
    const scanIntegrations = vi.fn(async () => [installation]);
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
                'codeEditorIntegration.listIntegrations': listIntegrations,
                'codeEditorIntegration.scanIntegration': scanIntegration,
                'codeEditorIntegration.scanIntegrations': scanIntegrations,
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

    it('delegates catalog and scan operations to the integration bridge', async () => {
        const hook = renderHook();

        await expect(hook.listIntegrations()).resolves.toEqual([integration]);
        await expect(hook.scanIntegration('vscode')).resolves.toEqual(
            installation,
        );
        await expect(hook.scanIntegrations()).resolves.toEqual([installation]);

        expect(listIntegrations).toHaveBeenCalledOnce();
        expect(scanIntegration).toHaveBeenCalledWith('vscode');
        expect(scanIntegrations).toHaveBeenCalledOnce();
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
