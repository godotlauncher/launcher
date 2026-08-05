import 'reflect-metadata';
import { createApplication } from '@mariodebono/di';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

vi.mock('../commands/userPreferences.js', () => ({
    getUserPreferences: vi.fn(),
    setUserPreferences: vi.fn(),
}));

import { CodeEditorIntegrationModule } from './codeEditorIntegration.module.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { VSCodeIntegration } from './integrations/vscode/vscodeIntegration.js';
import { VSCodiumIntegration } from './integrations/vscodium/vscodiumIntegration.js';

vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn(() => '/app'),
    },
}));

describe('CodeEditorIntegrationModule', () => {
    it('resolves its exported service through the DI graph', async () => {
        const app = await createApplication(CodeEditorIntegrationModule, {
            logger: false,
        });

        expect(app.get(CodeEditorIntegrationService)).toBeInstanceOf(
            CodeEditorIntegrationService,
        );

        await app.destroyAsync();
    });

    it('registers VS Code and VSCodium in deterministic order', async () => {
        const app = await createApplication(CodeEditorIntegrationModule, {
            logger: false,
        });

        const integrations = app.get(CodeEditorIntegrationRegistry).list();
        expect(integrations).toHaveLength(2);
        expect(integrations[0]).toBeInstanceOf(VSCodeIntegration);
        expect(integrations[1]).toBeInstanceOf(VSCodiumIntegration);

        await app.destroyAsync();
    });
});
