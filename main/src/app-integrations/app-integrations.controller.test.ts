import { describe, expect, it, vi } from 'vitest';
import { AppIntegrationsController } from './app-integrations.controller.js';
import type { AppIntegrationsService } from './app-integrations.service.js';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

describe('AppIntegrationsController', () => {
    it('returns renderer-safe integration summaries', async () => {
        const summaries = [
            {
                id: 'github',
                displayName: 'GitHub',
                state: 'not-connected' as const,
            },
        ];
        const appIntegrations = {
            list: vi.fn(() => summaries),
        } as unknown as AppIntegrationsService;
        const controller = new AppIntegrationsController(appIntegrations);

        await expect(controller.listIntegrations()).resolves.toEqual(summaries);
        expect(appIntegrations.list).toHaveBeenCalledOnce();
    });
});
