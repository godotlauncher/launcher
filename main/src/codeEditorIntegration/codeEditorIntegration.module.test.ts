import 'reflect-metadata';
import { createApplication } from '@mariodebono/di';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { CodeEditorIntegrationModule } from './codeEditorIntegration.module.js';
import { CodeEditorIntegrationRegistry } from './codeEditorIntegration.registry.js';
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { VSCodeIntegration } from './integrations/vscode/vscodeIntegration.js';

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

    it('registers VS Code exactly once', async () => {
        const app = await createApplication(CodeEditorIntegrationModule, {
            logger: false,
        });

        const integrations = app.get(CodeEditorIntegrationRegistry).list();
        expect(integrations).toHaveLength(1);
        expect(integrations[0]).toBeInstanceOf(VSCodeIntegration);

        await app.destroyAsync();
    });
});
