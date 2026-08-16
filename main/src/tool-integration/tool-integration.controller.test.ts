import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import { ToolIntegrationController } from './tool-integration.controller.js';
import type { ToolIntegrationService } from './tool-integration.service.js';
import type { ToolSummary } from './tool-integration.types.js';

const summary: ToolSummary = {
    metadata: { id: 'git', displayName: 'Git', order: 100 },
    settings: {
        enabled: true,
        executablePathOverride: null,
        executableArgsOverride: null,
    },
    installation: {
        executablePath: '/system/bin/git',
        executableArgs: [],
        version: 'git version 2.51.0',
        source: 'detected',
    },
    status: 'available',
    checkedAt: 123,
};

describe('ToolIntegrationController', () => {
    it('delegates listing and rescanning through renderer-safe summaries', async () => {
        const service = {
            refreshAll: vi.fn(async () => [summary]),
            rescanAll: vi.fn(async () => [summary]),
            refresh: vi.fn(async () => summary),
            rescan: vi.fn(async () => summary),
        } as unknown as ToolIntegrationService;
        const controller = new ToolIntegrationController(service);
        const expected = [
            {
                id: 'git',
                displayName: 'Git',
                status: 'available',
                version: 'git version 2.51.0',
                executablePath: '/system/bin/git',
            },
        ];

        await expect(controller.listIntegrations()).resolves.toEqual(expected);
        await expect(controller.rescanIntegrations()).resolves.toEqual(
            expected,
        );
        expect(service.refreshAll).toHaveBeenCalledOnce();
        expect(service.rescanAll).toHaveBeenCalledOnce();
        await expect(controller.refreshIntegration('git')).resolves.toEqual(
            expected[0],
        );
        await expect(controller.rescanIntegration('git')).resolves.toEqual(
            expected[0],
        );
        expect(service.refresh).toHaveBeenCalledWith('git');
        expect(service.rescan).toHaveBeenCalledWith('git');
    });
});
