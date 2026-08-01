import * as path from 'node:path';
import type {
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import type { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';

const CODE_EDITOR_ID = 'vscode' as const;

const integration: CodeEditorIntegrationSummary = {
    id: CODE_EDITOR_ID,
    displayName: 'Visual Studio Code',
};

const installation: CodeEditorInstallationSummary = {
    integrationId: CODE_EDITOR_ID,
    path: path.resolve('tools', 'code'),
    version: null,
};

function createServiceMock() {
    return {
        listIntegrations: vi.fn().mockReturnValue([integration]),
        scanIntegration: vi.fn().mockResolvedValue(installation),
        scanIntegrations: vi.fn().mockResolvedValue([installation]),
        validateIntegrationPath: vi.fn().mockResolvedValue({
            valid: true,
            installation,
        } satisfies CodeEditorPathValidationResult),
    } as unknown as CodeEditorIntegrationService;
}

describe('CodeEditorIntegrationController', () => {
    it('delegates integration listing and scanning to the service', async () => {
        const service = createServiceMock();
        const controller = new CodeEditorIntegrationController(service);

        await expect(controller.listIntegrations()).resolves.toEqual([
            integration,
        ]);
        await expect(
            controller.scanIntegration(CODE_EDITOR_ID),
        ).resolves.toEqual(installation);
        await expect(controller.scanIntegrations()).resolves.toEqual([
            installation,
        ]);
        expect(service.listIntegrations).toHaveBeenCalledWith();
        expect(service.scanIntegration).toHaveBeenCalledWith(CODE_EDITOR_ID);
        expect(service.scanIntegrations).toHaveBeenCalledWith();
    });

    it('delegates path validation to the service', async () => {
        const service = createServiceMock();
        const controller = new CodeEditorIntegrationController(service);

        await expect(
            controller.validateIntegrationPath(
                CODE_EDITOR_ID,
                path.resolve('tools', 'code'),
            ),
        ).resolves.toEqual({
            valid: true,
            installation,
        });
        expect(service.validateIntegrationPath).toHaveBeenCalledWith(
            CODE_EDITOR_ID,
            path.resolve('tools', 'code'),
        );
    });
});
