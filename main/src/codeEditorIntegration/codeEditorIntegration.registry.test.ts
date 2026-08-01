import { describe, expect, it, vi } from 'vitest';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import type { CodeEditorIntegration } from './codeEditorIntegration.types.js';

const CODE_EDITOR_ID = 'vscode' as const;

function createIntegration(): CodeEditorIntegration {
    return {
        metadata: {
            id: CODE_EDITOR_ID,
            displayName: 'Visual Studio Code',
        },
        detectInstallation: vi.fn(),
        validatePath: vi.fn(),
        isConfiguredForProject: vi.fn(),
        getGodotLaunchConfiguration: vi.fn(),
        configureProject: vi.fn(),
    };
}

describe('CodeEditorIntegrationRegistry', () => {
    it('resolves and lists registered integrations', () => {
        const integration = createIntegration();
        const registry = new CodeEditorIntegrationRegistry([integration]);

        expect(registry.get(CODE_EDITOR_ID)).toBe(integration);
        expect(registry.list()).toEqual([integration]);
    });

    it('rejects duplicate integration IDs', () => {
        expect(
            () =>
                new CodeEditorIntegrationRegistry([
                    createIntegration(),
                    createIntegration(),
                ]),
        ).toThrow('Duplicate code editor integration: vscode');
    });

    it('rejects unknown integration IDs', () => {
        const registry = new CodeEditorIntegrationRegistry([]);

        expect(() => registry.get('unknown' as never)).toThrow(
            'Unknown code editor integration: unknown',
        );
    });
});
