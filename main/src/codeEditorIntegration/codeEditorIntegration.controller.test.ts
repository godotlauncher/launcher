import * as path from 'node:path';
import type {
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSettings,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

vi.mock('./codeEditorIntegration.service.js', () => ({
    CodeEditorIntegrationService: class {},
}));

import { CodeEditorIntegrationController } from './codeEditorIntegration.controller.js';
import type { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';

const CODE_EDITOR_ID = 'vscode' as const;

const integration: CodeEditorIntegrationSummary = {
    id: CODE_EDITOR_ID,
    displayName: 'Visual Studio Code',
    capabilities: { textEditor: true, dotnet: true },
};

const installation: CodeEditorInstallationSummary = {
    integrationId: CODE_EDITOR_ID,
    path: path.resolve('tools', 'code'),
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

function createServiceMock() {
    return {
        listIntegrations: vi.fn().mockReturnValue([integration]),
        listIntegrationSettings: vi.fn().mockResolvedValue([settings]),
        updateIntegrationSettings: vi.fn().mockResolvedValue(settings),
        setDefaultIntegration: vi
            .fn()
            .mockResolvedValue([{ ...settings, isDefault: true }]),
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

    it('delegates integration settings to the service', async () => {
        const service = createServiceMock();
        const controller = new CodeEditorIntegrationController(service);
        const update = {
            enabled: false,
            customPath: null,
            execFlagsOverride: '',
        };

        await expect(controller.listIntegrationSettings()).resolves.toEqual([
            settings,
        ]);
        await expect(
            controller.updateIntegrationSettings(CODE_EDITOR_ID, update),
        ).resolves.toEqual(settings);
        await expect(
            controller.setDefaultIntegration(CODE_EDITOR_ID),
        ).resolves.toEqual([{ ...settings, isDefault: true }]);
        expect(service.listIntegrationSettings).toHaveBeenCalledOnce();
        expect(service.updateIntegrationSettings).toHaveBeenCalledWith(
            CODE_EDITOR_ID,
            update,
        );
        expect(service.setDefaultIntegration).toHaveBeenCalledWith(
            CODE_EDITOR_ID,
        );
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
